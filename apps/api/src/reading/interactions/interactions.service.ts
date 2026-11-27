import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { bibleVerses, feedItems, userEvents, users } from '../../db/scripture';
import { DATABASE } from '../database';
import type { AppDatabase, ReadingTransaction } from '../database';
import { AffinityService } from '../recommendations/affinity.service';
import {
  InteractionEventInput,
  InteractionRequestBody,
  InteractionResponse,
  isUserEventType,
} from './interactions.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class InteractionsService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    private readonly affinityService: AffinityService,
  ) {}

  async recordInteractions(
    userId: string,
    body: InteractionRequestBody,
  ): Promise<InteractionResponse> {
    this.validateUserId(userId);
    await this.ensureUserExists(userId);

    const inputs = this.normalizeBody(body);
    let accepted = 0;
    let affinityUpdates = 0;
    let rejected = 0;

    if (inputs.length > 100) throw new BadRequestException('Submit at most 100 events');
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select id from users where id = ${userId} for update`);
      for (const input of inputs) {
        const event = await this.toValidEvent(tx, input);
        if (!event) { rejected++; continue; }
        const [inserted] = await tx.insert(userEvents).values({ ...event, userId, createdAt: sql`clock_timestamp()` })
          .onConflictDoNothing({ target: [userEvents.userId, userEvents.requestId] })
          .returning({ id: userEvents.id });
        accepted++;
        if (inserted) affinityUpdates += await this.affinityService.applyEvent(userId, event, tx);
      }
    });
    return { accepted, affinityUpdates, rejected };
  }

  private validateUserId(userId: string | undefined): asserts userId is string {
    if (!userId || !UUID_PATTERN.test(userId)) {
      throw new BadRequestException('x-user-id must be a valid UUID');
    }
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new BadRequestException('User does not exist');
    }
  }

  private normalizeBody(body: InteractionRequestBody): unknown[] {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body must be an event or events array');
    }

    if ('events' in body) {
      if (!Array.isArray(body.events)) {
        throw new BadRequestException('events must be an array');
      }

      return body.events;
    }

    return [body];
  }

  private async toValidEvent(
    tx: ReadingTransaction,
    input: unknown,
  ): Promise<InteractionEventInput | null> {
    if (!input || typeof input !== 'object') {
      return null;
    }

    const event = input as Record<string, unknown>;

    if (!isUserEventType(event.eventType)) {
      return null;
    }

    const feedItemId =
      typeof event.feedItemId === 'string' && UUID_PATTERN.test(event.feedItemId)
        ? event.feedItemId.toLowerCase()
        : undefined;
    let verseId =
      typeof event.verseId === 'string' && UUID_PATTERN.test(event.verseId)
        ? event.verseId.toLowerCase()
        : undefined;

    if (event.feedItemId && !feedItemId) {
      return null;
    }

    if (event.verseId && !verseId) {
      return null;
    }

    if (event.requestId !== undefined && (typeof event.requestId !== 'string' || !UUID_PATTERN.test(event.requestId))) return null;
    if (verseId && !(await tx.select({id: bibleVerses.id}).from(bibleVerses).where(eq(bibleVerses.id, verseId)).limit(1)).length) return null;
    if (feedItemId) {
      const linked = await this.getVerseIdForFeedItem(tx, feedItemId);
      if (!linked || (verseId && verseId !== linked)) return null;
      verseId = linked;
    }

    const durationMs =
      typeof event.durationMs === 'number' &&
      Number.isFinite(event.durationMs) &&
      event.durationMs >= 0
        ? Math.round(event.durationMs)
        : undefined;

    if (event.durationMs !== undefined && durationMs === undefined) {
      return null;
    }

    const metadata =
      event.metadata &&
      typeof event.metadata === 'object' &&
      !Array.isArray(event.metadata)
        ? (event.metadata as Record<string, unknown>)
        : undefined;

    if (event.metadata !== undefined && metadata === undefined) {
      return null;
    }

    return {
      requestId: event.requestId as string | undefined,
      durationMs,
      eventType: event.eventType,
      feedItemId,
      metadata,
      verseId,
    };
  }

  private async getVerseIdForFeedItem(tx: ReadingTransaction, feedItemId: string): Promise<string | undefined> {
    const [feedItem] = await tx
      .select({ verseId: feedItems.verseId })
      .from(feedItems)
      .where(eq(feedItems.id, feedItemId))
      .limit(1);

    return feedItem?.verseId ?? undefined;
  }
}
