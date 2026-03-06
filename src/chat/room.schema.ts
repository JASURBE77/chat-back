import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RoomDocument = Room & Document;

@Schema({ timestamps: true })
export class Room {
  @Prop({ default: '' })
  name: string;

  @Prop({ default: 'direct', enum: ['direct', 'group'] })
  type: 'direct' | 'group';

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true })
  members: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Message', default: null })
  lastMessage: Types.ObjectId | null;

  @Prop({ default: '' })
  avatar: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy: Types.ObjectId | null;
}

export const RoomSchema = SchemaFactory.createForClass(Room);
