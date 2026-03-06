import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) throw new ConflictException('Email already in use');

    const existingUsername = await this.usersService.findByUsername(dto.username);
    if (existingUsername) throw new ConflictException('Username already taken');

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      username: dto.username,
      email: dto.email,
      password: hashed,
    });

    const token = this.jwtService.sign({ userId: user._id, username: user.username });
    return { token, user: { _id: user._id, username: user.username, email: user.email, avatar: user.avatar, bio: user.bio } };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign({ userId: user._id, username: user.username });
    return { token, user: { _id: user._id, username: user.username, email: user.email, avatar: user.avatar, bio: user.bio } };
  }
}
