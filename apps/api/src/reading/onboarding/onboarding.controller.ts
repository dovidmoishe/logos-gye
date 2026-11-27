import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { OnboardingService } from './onboarding.service';
import type {
  SaveOnboardingTopicsRequest,
  SaveOnboardingTopicsResponse,
} from './onboarding.types';

@Controller('api/reading/onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('topics')
  @UseGuards(AuthGuard)
  saveTopics(
    @CurrentUser() user: AuthUser,
    @Body() body: SaveOnboardingTopicsRequest,
  ): Promise<SaveOnboardingTopicsResponse> {
    return this.onboardingService.saveTopics(user.id, body);
  }
}
