import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, trim: true })
  username: string;

  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ default: '' })
  avatar: string;

  @Prop({ default: 'Hey there! I am using TeleChat.' })
  bio: string;

  @Prop({ default: false })
  isOnline: boolean;

  @Prop({ default: null })
  lastSeen: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
