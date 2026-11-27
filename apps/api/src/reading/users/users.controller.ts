import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { UsersService } from './users.service';
import type { UpdateUserProfileRequest, UserProfile } from './users.types';

@Controller('api/reading/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  getProfile(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateUserProfileRequest,
  ): Promise<UserProfile> {
    return this.usersService.updateProfile(user.id, body);
  }
}
