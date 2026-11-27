import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import {
  bibleVerses,
  userTopicAffinities,
  verseTopics,
} from '../../db/scripture';
import type { ReadingTransaction } from '../database';
import { ONBOARDING_INITIAL_AFFINITY } from './recommendation.config';
import { AffinityEvent } from './recommendation.types';
import { ScoringService } from './scoring.service';

@Injectable()
export class AffinityService {
  constructor(
    private readonly scoringService: ScoringService,
  ) {}

  async applyEvent(userId: string, event: AffinityEvent, db: ReadingTransaction): Promise<number> {
    if (!event.verseId) {
      return 0;
    }

    const [verse] = await db
      .select({ id: bibleVerses.id, wordCount: bibleVerses.wordCount })
      .from(bibleVerses)
      .where(eq(bibleVerses.id, event.verseId))
      .limit(1);

    if (!verse) {
      return 0;
    }

    const weight = this.scoringService.getInteractionWeight(event.eventType, {
      durationMs: event.durationMs,
      wordCount: verse.wordCount,
    });

    if (weight === 0) {
      return 0;
    }

    const topicScores = await db
      .select({
        relevanceScore: verseTopics.relevanceScore,
        topicId: verseTopics.topicId,
      })
      .from(verseTopics)
      .where(eq(verseTopics.verseId, event.verseId));

    if (topicScores.length === 0) {
      return 0;
    }

    const now = new Date();

    for (const topicScore of topicScores) {
      const contribution = this.scoringService.getAffinityContribution(
        weight,
        topicScore.relevanceScore,
      );

      await db
        .insert(userTopicAffinities)
        .values({
          interactionCount: 1,
          lastInteractionAt: now,
          score: contribution,
          topicId: topicScore.topicId,
          userId,
        })
        .onConflictDoUpdate({
          target: [userTopicAffinities.userId, userTopicAffinities.topicId],
          set: {
            interactionCount: sql`${userTopicAffinities.interactionCount} + 1`,
            lastInteractionAt: now,
            score: sql`${userTopicAffinities.score} + ${contribution}`,
            updatedAt: now,
          },
        });
    }

    await this.normalizeUserAffinities(userId, db);

    return topicScores.length;
  }

  async applyOnboardingTopics(userId: string, topicIds: string[], db: ReadingTransaction): Promise<number> {
    if (topicIds.length === 0) {
      return 0;
    }

    const now = new Date();

    for (const topicId of topicIds) {
      await db
        .insert(userTopicAffinities)
        .values({
          interactionCount: 0,
          lastInteractionAt: now,
          score: ONBOARDING_INITIAL_AFFINITY,
          topicId,
          userId,
        })
        .onConflictDoUpdate({
          target: [userTopicAffinities.userId, userTopicAffinities.topicId],
          set: {
            score: sql`greatest(${userTopicAffinities.score}, ${ONBOARDING_INITIAL_AFFINITY})`,
            updatedAt: now,
          },
        });
    }

    await this.normalizeUserAffinities(userId, db);

    return topicIds.length;
  }

  async normalizeUserAffinities(userId: string, db: ReadingTransaction): Promise<void> {
    const [{ maxScore } = { maxScore: 0 }] = await db
      .select({
        maxScore: sql<number>`coalesce(max(${userTopicAffinities.score}), 0)::float`,
      })
      .from(userTopicAffinities)
      .where(eq(userTopicAffinities.userId, userId));

    if (!maxScore || maxScore <= 0) {
      await db
        .update(userTopicAffinities)
        .set({ score: 0, updatedAt: new Date() })
        .where(eq(userTopicAffinities.userId, userId));
      return;
    }

    await db
      .update(userTopicAffinities)
      .set({
        score: sql`greatest(0, least(1, ${userTopicAffinities.score} / ${maxScore}))`,
        updatedAt: new Date(),
      })
      .where(eq(userTopicAffinities.userId, userId));
  }
}
