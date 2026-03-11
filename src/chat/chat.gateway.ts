import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { UsersService } from '../users/users.service';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, string>(); // socketId -> userId

  constructor(
    private chatService: ChatService,
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      const userId = payload.userId;
      this.connectedUsers.set(client.id, userId);
      client.data.userId = userId;
      client.data.username = payload.username;

      await this.usersService.setOnlineStatus(userId, true);

      const rooms = await this.chatService.getUserRooms(userId);
      rooms.forEach((room) => client.join(room._id.toString()));

      this.server.emit('userOnline', { userId });
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (userId) {
      this.connectedUsers.delete(client.id);
      await this.usersService.setOnlineStatus(userId, false);
      this.server.emit('userOffline', { userId });
    }
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    client.join(data.roomId);
    const messages = await this.chatService.getRoomMessages(data.roomId);
    client.emit('roomMessages', { roomId: data.roomId, messages });
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; content: string; type?: string; replyTo?: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    const message = await this.chatService.createMessage({
      sender: userId,
      room: data.roomId,
      content: data.content,
      type: data.type || 'text',
      replyTo: data.replyTo,
    });

    this.server.to(data.roomId).emit('newMessage', message);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isTyping: boolean },
  ) {
    client.to(data.roomId).emit('userTyping', {
      userId: client.data.userId,
      username: client.data.username,
      isTyping: data.isTyping,
      roomId: data.roomId,
    });
  }

  @SubscribeMessage('addReaction')
  async handleAddReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; emoji: string; roomId: string },
  ) {
    const userId = client.data.userId;
    const msg = await this.chatService.addReaction(data.messageId, userId, data.emoji);
    if (msg) {
      this.server.to(data.roomId).emit('messageReaction', msg);
    }
  }

  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; roomId: string },
  ) {
    const userId = client.data.userId;
    const msg = await this.chatService.deleteMessage(data.messageId, userId);
    if (msg) {
      this.server.to(data.roomId).emit('messageDeleted', { messageId: data.messageId, roomId: data.roomId });
    }
  }

  @SubscribeMessage('editMessage')
  async handleEditMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; content: string; roomId: string },
  ) {
    const userId = client.data.userId;
    const msg = await this.chatService.editMessage(data.messageId, userId, data.content);
    if (msg) {
      this.server.to(data.roomId).emit('messageEdited', msg);
    }
  }

  @SubscribeMessage('openDirectChat')
  async handleOpenDirectChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetUserId: string },
  ) {
    const userId = client.data.userId;
    const room = await this.chatService.getOrCreateDirectRoom(userId, data.targetUserId);
    client.join(room._id.toString());

    const targetSocket = this.findSocketByUserId(data.targetUserId);
    if (targetSocket) {
      targetSocket.join(room._id.toString());
    }

    const messages = await this.chatService.getRoomMessages(room._id.toString());
    const populatedRoom = await this.chatService.getRoomById(room._id.toString());
    client.emit('directRoomReady', { room: populatedRoom, messages });
  }

  // ─── CALL SIGNALING (WebRTC) ─────────────────────────────────────────────

  @SubscribeMessage('callUser')
  handleCallUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetUserId: string; signal: any; callerName: string },
  ) {
    const targetSocket = this.findSocketByUserId(data.targetUserId);
    if (!targetSocket) {
      client.emit('callFailed', { reason: 'User is offline' });
      return;
    }
    targetSocket.emit('incomingCall', {
      callerId: client.data.userId,
      callerName: client.data.username,
      signal: data.signal,
    });
  }

  @SubscribeMessage('answerCall')
  handleAnswerCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callerId: string; signal: any },
  ) {
    const callerSocket = this.findSocketByUserId(data.callerId);
    if (callerSocket) {
      callerSocket.emit('callAnswered', { signal: data.signal });
    }
  }

  @SubscribeMessage('rejectCall')
  handleRejectCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { callerId: string },
  ) {
    const callerSocket = this.findSocketByUserId(data.callerId);
    if (callerSocket) {
      callerSocket.emit('callRejected', { by: client.data.username });
    }
  }

  @SubscribeMessage('endCall')
  handleEndCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetUserId: string },
  ) {
    const targetSocket = this.findSocketByUserId(data.targetUserId);
    if (targetSocket) {
      targetSocket.emit('callEnded');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  private findSocketByUserId(userId: string): Socket | undefined {
    for (const [socketId, uid] of this.connectedUsers) {
      if (uid === userId) {
        return this.server.sockets.sockets.get(socketId);
      }
    }
    return undefined;
  }
}
