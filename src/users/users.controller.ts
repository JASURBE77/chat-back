import { Controller, Get, Query, Param, UseGuards, Request, Put, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('search')
  search(@Query('q') query: string, @Request() req: any) {
    return this.usersService.searchUsers(query || '', req.user.userId);
  }

  @Get('me')
  getMe(@Request() req: any) {
    return this.usersService.findById(req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Put('me')
  updateProfile(@Request() req: any, @Body() body: any) {
    const { username, bio, avatar } = body;
    return this.usersService.updateProfile(req.user.userId, { username, bio, avatar });
  }
}
