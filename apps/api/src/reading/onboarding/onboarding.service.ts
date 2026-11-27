import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray, sql } from 'drizzle-orm';

import {
  topics,
  userOnboardingTopics,
  users,
} from '../../db/scripture';
import { DATABASE } from '../database';
import type { AppDatabase } from '../database';
import { AffinityService } from '../recommendations/affinity.service';
import {
  MAX_ONBOARDING_TOPICS,
  MIN_ONBOARDING_TOPICS,
  SaveOnboardingTopicsRequest,
  SaveOnboardingTopicsResponse,
  TopicDto,
  TopicsResponse,
  UUID_PATTERN,
} from './onboarding.types';

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly affinityService: AffinityService,
  ) {}

  async listTopics(): Promise<TopicsResponse> {
    const rows = await this.db
      .select({
        description: topics.description,
        id: topics.id,
        name: topics.name,
        slug: topics.slug,
      })
      .from(topics)
      .orderBy(asc(topics.name));

    return { topics: rows };
  }

  async saveTopics(
    userId: string,
    body: SaveOnboardingTopicsRequest,
  ): Promise<SaveOnboardingTopicsResponse> {
    const topicIds = this.parseTopicIds(body);
    const selectedTopics = await this.getExistingTopics(topicIds);

    if (selectedTopics.length !== topicIds.length) {
      const foundIds = new Set(selectedTopics.map((topic) => topic.id));
      const missingIds = topicIds.filter((topicId) => !foundIds.has(topicId));

      throw new BadRequestException(
        `Unknown topic ids: ${missingIds.join(', ')}`,
      );
    }

    const completedAt = new Date();

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select id from users where id = ${userId} for update`);
      await tx
        .delete(userOnboardingTopics)
        .where(eq(userOnboardingTopics.userId, userId));

      if (topicIds.length) await tx.insert(userOnboardingTopics).values(
        topicIds.map((topicId) => ({
          topicId,
          userId,
        })),
      );

      const [updatedUser] = await tx
        .update(users)
        .set({ onboardingCompletedAt: completedAt })
        .where(eq(users.id, userId))
        .returning({ id: users.id });

      if (!updatedUser) {
        throw new BadRequestException('User does not exist');
      }
      await tx.execute(sql`delete from user_topic_affinities where user_id = ${userId} and interaction_count = 0`);
      await this.affinityService.applyOnboardingTopics(userId, topicIds, tx);
    });

    return {
      onboardingCompletedAt: completedAt.toISOString(),
      topics: topicIds.map(
        (topicId) =>
          selectedTopics.find((topic) => topic.id === topicId) as TopicDto,
      ),
    };
  }

  private parseTopicIds(body: SaveOnboardingTopicsRequest): string[] {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be an object');
    }

    if (!Array.isArray(body.topicIds)) {
      throw new BadRequestException('topicIds must be an array');
    }

    const topicIds = [
      ...new Set(
        body.topicIds.map((topicId) => {
          if (typeof topicId !== 'string' || !UUID_PATTERN.test(topicId)) {
            throw new BadRequestException('topicIds must be valid UUIDs');
          }

          return topicId.toLowerCase();
        }),
      ),
    ];

    if (
      topicIds.length < MIN_ONBOARDING_TOPICS ||
      topicIds.length > MAX_ONBOARDING_TOPICS
    ) {
      throw new BadRequestException(
        `Select between ${MIN_ONBOARDING_TOPICS} and ${MAX_ONBOARDING_TOPICS} topics`,
      );
    }

    return topicIds;
  }

  private async getExistingTopics(topicIds: string[]): Promise<TopicDto[]> {
    return this.db
      .select({
        description: topics.description,
        id: topics.id,
        name: topics.name,
        slug: topics.slug,
      })
      .from(topics)
      .where(inArray(topics.id, topicIds));
  }
}
