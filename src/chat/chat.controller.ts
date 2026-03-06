import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

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
