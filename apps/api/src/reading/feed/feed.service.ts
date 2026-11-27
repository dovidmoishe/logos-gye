import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { feedSessions, users } from '../../db/scripture';
import { DATABASE } from '../database';
import type { AppDatabase, ReadingTransaction } from '../database';
import {
  clampFeedLimit,
  decodeFeedCursor,
  encodeFeedCursor,
  FEED_SESSION_TTL_MS,
  parseSessionState,
  serializeSessionState,
} from './feed-cursor';
import { FeedItemDto, FeedResponseDto, FeedTopicDto } from './feed.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FeedCandidateRow = {
  bookName: string;
  chapter: number;
  feedItemId: string;
  finalScore: number | string;
  randomness: number | string;
  recentPenalty: number | string;
  text: string;
  topicAffinity: number | string;
  topics: FeedTopicDto[] | string | null;
  translationCode: string;
  translationName: string;
  verse: number;
  verseId: string;
};

@Injectable()
export class FeedService {
  constructor(@Inject(DATABASE) private readonly db: AppDatabase) {}

  async getFeed(options: {
    cursor?: string;
    limit?: string;
    userId?: string;
  }): Promise<FeedResponseDto> {
    const userId = this.validateUserId(options.userId);
    const limit = clampFeedLimit(options.limit);
    await this.ensureUserExists(userId);
    return this.db.transaction(async tx => {
      const session = await this.getOrCreateSession(tx, userId, options.cursor);
      const state = parseSessionState(session.cursor);
      const rows = await this.getCandidates(tx, userId, state.seenFeedItemIds, limit);
      const items = rows.map((row) => this.toFeedItem(row));

      await tx
        .update(feedSessions)
        .set({
          cursor: serializeSessionState(
            state,
            items.map((item) => item.feedItemId),
          ),
        })
        .where(eq(feedSessions.id, session.id));

      return {
        expiresAt: session.expiresAt.toISOString(),
        items,
        nextCursor: items.length > 0 ? encodeFeedCursor(session.id) : null,
        sessionId: session.id,
      };
    });
  }

  private validateUserId(userId: string | undefined): string {
    if (!userId || !UUID_PATTERN.test(userId)) {
      throw new BadRequestException('x-user-id must be a valid UUID');
    }

    return userId;
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

  private async getOrCreateSession(tx: ReadingTransaction, userId: string, cursor?: string) {
    const now = new Date();

    if (cursor) {
      const sessionId = decodeFeedCursor(cursor);

      if (!sessionId || !UUID_PATTERN.test(sessionId)) {
        throw new BadRequestException('Invalid feed cursor');
      }

      const [session] = await tx
        .select()
        .from(feedSessions)
        .where(eq(feedSessions.id, sessionId))
        .for("update")
        .limit(1);

      if (!session || session.userId !== userId || session.expiresAt <= now) {
        throw new NotFoundException('Feed session was not found or has expired');
      }

      return session;
    }

    const expiresAt = new Date(now.getTime() + FEED_SESSION_TTL_MS);
    const [session] = await tx
      .insert(feedSessions)
      .values({
        cursor: JSON.stringify({ seenFeedItemIds: [] }),
        expiresAt,
        userId,
      })
      .returning();

    return session;
  }

  private async getCandidates(
    tx: ReadingTransaction,
    userId: string,
    seenFeedItemIds: string[],
    limit: number,
  ): Promise<FeedCandidateRow[]> {
    const seenFilter =
      seenFeedItemIds.length > 0
        ? sql`and fi.id not in (${sql.join(
            seenFeedItemIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`
        : sql``;

    const result = await tx.execute(sql`
      with candidate_scores as (
        select
          fi.id as "feedItemId",
          bv.id as "verseId",
          bv.chapter,
          bv.verse,
          bv.text,
          bb.name as "bookName",
          bt.code as "translationCode",
          bt.name as "translationName",
          coalesce(sum(uta.score * vt.relevance_score), 0)::float as "topicAffinity",
          case
            when max(ue.created_at) is null then 0
            when max(ue.created_at) > now() - interval '1 day' then 0.45
            when max(ue.created_at) > now() - interval '7 days' then 0.2
            else 0
          end::float as "recentPenalty",
          random()::float as randomness
        from feed_items fi
        inner join bible_verses bv on bv.id = fi.verse_id
        inner join bible_books bb on bb.id = bv.book_id
        inner join bible_translations bt on bt.id = bv.translation_id
        left join verse_topics vt on vt.verse_id = bv.id
        left join user_topic_affinities uta
          on uta.topic_id = vt.topic_id
          and uta.user_id = ${userId}
        left join (select verse_id, max(created_at) as created_at from user_events
          where user_id = ${userId} and created_at > now() - interval '30 days' group by verse_id) ue on ue.verse_id = bv.id
        where fi.type = 'VERSE'
        ${seenFilter}
        group by fi.id, bv.id, bb.name, bt.code, bt.name
      )
      select
        candidate_scores.*,
        greatest(
          0,
          ("topicAffinity" * 0.8) + (randomness * 0.2) - "recentPenalty"
        )::float as "finalScore",
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', topic_rows.id,
                'slug', topic_rows.slug,
                'name', topic_rows.name,
                'relevanceScore', topic_rows.relevance_score
              )
              order by topic_rows.relevance_score desc
            )
            from (
              select t.id, t.slug, t.name, vt.relevance_score
              from verse_topics vt
              inner join topics t on t.id = vt.topic_id
              where vt.verse_id = candidate_scores."verseId"
              order by vt.relevance_score desc
              limit 5
            ) topic_rows
          ),
          '[]'::jsonb
        ) as topics
      from candidate_scores
      order by "finalScore" desc, randomness desc
      limit ${limit}
    `);

    return result.rows as FeedCandidateRow[];
  }

  private toFeedItem(row: FeedCandidateRow): FeedItemDto {
    return {
      feedItemId: row.feedItemId,
      score: {
        final: Number(row.finalScore),
        randomness: Number(row.randomness),
        recentPenalty: Number(row.recentPenalty),
        topicAffinity: Number(row.topicAffinity),
      },
      topics: this.parseTopics(row.topics),
      type: 'VERSE',
      verse: {
        book: row.bookName,
        chapter: row.chapter,
        reference: `${row.bookName} ${row.chapter}:${row.verse}`,
        text: row.text,
        translation: {
          code: row.translationCode,
          name: row.translationName,
        },
        verse: row.verse,
        verseId: row.verseId,
      },
    };
  }

  private parseTopics(topics: FeedCandidateRow['topics']): FeedTopicDto[] {
    if (!topics) {
      return [];
    }

    if (typeof topics === 'string') {
      return JSON.parse(topics) as FeedTopicDto[];
    }

    return topics;
  }
}
