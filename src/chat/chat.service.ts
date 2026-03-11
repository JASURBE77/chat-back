import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './message.schema';
import { Room, RoomDocument } from './room.schema';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
  ) {}

  // ----- ROOMS -----

  async getOrCreateDirectRoom(userId1: string, userId2: string): Promise<RoomDocument> {
    const existing = await this.roomModel.findOne({
      type: 'direct',
      members: { $all: [userId1, userId2], $size: 2 },
    });
    if (existing) return existing;

    return this.roomModel.create({
      type: 'direct',
      members: [userId1, userId2],
    });
  }

  async createGroupRoom(name: string, memberIds: string[], creatorId: string): Promise<RoomDocument> {
    return this.roomModel.create({
      name,
      type: 'group',
      members: memberIds,
      createdBy: creatorId,
    });
  }

  async getUserRooms(userId: string) {
    return this.roomModel
      .find({ members: userId })
      .populate('members', '-password')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username avatar' },
      })
      .sort({ updatedAt: -1 });
  }

  async getRoomById(roomId: string) {
    return this.roomModel
      .findById(roomId)
      .populate('members', '-password')
      .lean();
  }

  // ----- MESSAGES -----

  async getRoomMessages(roomId: string, limit = 50, skip = 0) {
    return this.messageModel
      .find({ room: roomId, isDeleted: false })
      .populate('sender', 'username avatar')
      .populate({ path: 'replyTo', populate: { path: 'sender', select: 'username' } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .then((msgs) => msgs.reverse());
  }

  async createMessage(data: {
    sender: string;
    room: string;
    content: string;
    type?: string;
    replyTo?: string;
  }): Promise<MessageDocument> {
    const msg = await this.messageModel.create({
      sender: data.sender,
      room: data.room,
      content: data.content,
      type: data.type || 'text',
      replyTo: data.replyTo || null,
    });

    await this.roomModel.findByIdAndUpdate(data.room, {
      lastMessage: msg._id,
      updatedAt: new Date(),
    });

    return msg.populate([
      { path: 'sender', select: 'username avatar' },
      { path: 'replyTo', populate: { path: 'sender', select: 'username' } },
    ]);
  }

  async addReaction(messageId: string, userId: string, emoji: string) {
    const msg = await this.messageModel.findById(messageId);
    if (!msg) return null;

    const existingIdx = msg.reactions.findIndex((r) => r.userId === userId);
    if (existingIdx > -1) {
      if (msg.reactions[existingIdx].emoji === emoji) {
        msg.reactions.splice(existingIdx, 1);
      } else {
        msg.reactions[existingIdx].emoji = emoji;
      }
    } else {
      msg.reactions.push({ userId, emoji });
    }

    await msg.save();
    return msg.populate({ path: 'sender', select: 'username avatar' });
  }

  async deleteMessage(messageId: string, userId: string) {
    return this.messageModel.findOneAndUpdate(
      { _id: messageId, sender: userId },
      { isDeleted: true, content: 'This message was deleted' },
      { new: true },
    );
  }

  async editMessage(messageId: string, userId: string, content: string) {
    return this.messageModel
      .findOneAndUpdate(
        { _id: messageId, sender: userId },
        { content, isEdited: true },
        { new: true },
      )
      .populate('sender', 'username avatar');
  }
}
