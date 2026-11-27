import { Injectable } from '@nestjs/common';

import {
  DWELL_CAP_MS,
  ESTIMATED_READING_SPEED_WPM,
  INTERACTION_WEIGHTS,
} from './recommendation.config';
import { UserEventType } from './recommendation.types';

@Injectable()
export class ScoringService {
  getInteractionWeight(
    eventType: UserEventType,
    options?: { durationMs?: number; wordCount?: number },
  ): number {
    if (eventType !== 'VERSE_READ') {
      return INTERACTION_WEIGHTS[eventType];
    }

    return this.getDwellWeight(options?.durationMs, options?.wordCount);
  }

  getDwellWeight(durationMs?: number, wordCount?: number): number {
    if (!durationMs || !wordCount || durationMs <= 0 || wordCount <= 0) {
      return 0;
    }

    const cappedDurationMs = Math.min(durationMs, DWELL_CAP_MS);
    const expectedReadMs = (wordCount / ESTIMATED_READING_SPEED_WPM) * 60_000;
    const completion = Math.min(cappedDurationMs / expectedReadMs, 1);

    return Math.max(0, Math.min(3, completion * 3));
  }

  getAffinityContribution(weight: number, relevanceScore: number): number {
    return weight * relevanceScore;
  }
}
