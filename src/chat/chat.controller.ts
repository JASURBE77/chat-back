import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private chatService: ChatService,
    private config: ConfigService,
  ) {}

  // Xirsys'dan vaqtinchalik ICE server tokenlarini oladi.
  // Credentials backend'da saqlanadi — frontendga faqat token keladi.
  @Get('ice-servers')
  async getIceServers() {
    const ident   = this.config.get<string>('XIRSYS_IDENT');
    const secret  = this.config.get<string>('XIRSYS_SECRET');
    const channel = this.config.get<string>('XIRSYS_CHANNEL') || 'chat';

    if (!ident || !secret) {
      // Xirsys sozlanmagan bo'lsa, umumiy bepul STUN qaytaramiz
      return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];
    }

    try {
      const basic = Buffer.from(`${ident}:${secret}`).toString('base64');
      const res = await fetch(`https://global.xirsys.net/_turn/${channel}`, {
        method: 'PUT',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ format: 'urls' }),
      });

      if (!res.ok) throw new Error(`Xirsys error: ${res.status}`);
      const data = await res.json() as { v: { iceServers: RTCIceServer[] } };
      return data.v.iceServers;
    } catch (err) {
      console.error('ICE servers fetch failed:', err);
      throw new InternalServerErrorException('ICE servers olishda xato');
    }
  }

  @Get('rooms')
  getUserRooms(@Request() req: any) {
    return this.chatService.getUserRooms(req.user.userId);
  }

  @Get('rooms/:id/messages')
  getMessages(
    @Param('id') roomId: string,
    @Query('limit') limit: string,
    @Query('skip') skip: string,
  ) {
    return this.chatService.getRoomMessages(roomId, +limit || 50, +skip || 0);
  }

  @Post('rooms/group')
  createGroup(@Request() req: any, @Body() body: { name: string; memberIds: string[] }) {
    const allMembers = [...new Set([req.user.userId, ...body.memberIds])];
    return this.chatService.createGroupRoom(body.name, allMembers, req.user.userId);
  }

  @Post('rooms/direct')
  openDirect(@Request() req: any, @Body() body: { targetUserId: string }) {
    return this.chatService.getOrCreateDirectRoom(req.user.userId, body.targetUserId);
  }
}
