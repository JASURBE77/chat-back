import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('-password').exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ username }).exec();
  }

  async create(data: Partial<User>): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  async searchUsers(query: string, currentUserId: string): Promise<UserDocument[]> {
    return this.userModel
      .find({
        _id: { $ne: currentUserId },
        $or: [
          { username: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
        ],
      })
      .select('-password')
      .limit(20)
      .exec();
  }

  async setOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      isOnline,
      lastSeen: isOnline ? undefined : new Date(),
    });
  }

  async updateProfile(userId: string, data: Partial<User>): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(userId, data, { new: true })
      .select('-password');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
