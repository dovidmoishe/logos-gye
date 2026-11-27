import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import type {
  InteractionRequestBody,
  InteractionResponse,
} from './interactions.types';
import { InteractionsService } from './interactions.service';

@Controller('api/reading/interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post()
  @UseGuards(AuthGuard)
  recordInteractions(
    @CurrentUser() user: AuthUser,
    @Body() body: InteractionRequestBody,
  ): Promise<InteractionResponse> {
    return this.interactionsService.recordInteractions(user.id, body);
  }
}
