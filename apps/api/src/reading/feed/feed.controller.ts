import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { FeedService } from './feed.service';
import type { FeedResponseDto } from './feed.types';

@Controller('api/reading/feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  @UseGuards(AuthGuard)
  getFeed(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<FeedResponseDto> {
    return this.feedService.getFeed({ cursor, limit, userId: user.id });
  }
}
