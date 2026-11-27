import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { OnboardingService } from './onboarding.service';
import type { TopicsResponse } from './onboarding.types';

@Controller('api/reading/topics')
export class TopicsController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  @UseGuards(AuthGuard)
  listTopics(): Promise<TopicsResponse> {
    return this.onboardingService.listTopics();
  }
}
