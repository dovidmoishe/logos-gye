import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Embedding dimensions — must match the configured embedding provider/model. */
export const EMBEDDING_DIMENSIONS = 1536;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const testamentEnum = pgEnum('testament', ['OLD', 'NEW']);

export const feedItemTypeEnum = pgEnum('feed_item_type', [
  'VERSE',
  'DECLARATION',
  'DEVOTIONAL',
  'QUOTE',
  'IMAGE',
  'VIDEO',
  'SERMON',
]);

export const userEventTypeEnum = pgEnum('user_event_type', [
  'VERSE_IMPRESSION',
  'VERSE_READ',
  'VERSE_LIKE',
  'VERSE_UNLIKE',
  'VERSE_SAVE',
  'VERSE_UNSAVE',
  'VERSE_SHARE',
  'VERSE_SKIP',
  'VERSE_REVISIT',
  'SEARCH',
  'SEARCH_RESULT_OPEN',
  'SCRIPTURE_FINDER_QUERY',
  'SCRIPTURE_FINDER_RESULT_OPEN',
]);

// ---------------------------------------------------------------------------
// Users & Auth
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  displayName: varchar('display_name', { length: 128 }),
  avatarUrl: text('avatar_url'),
  timezone: varchar('timezone', { length: 64 }),
  xp: integer('xp').notNull().default(0),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastStreakDate: date('last_streak_date', { mode: 'string' }),
  onboardingCompletedAt: timestamp('onboarding_completed_at', {
    withTimezone: true,
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// Bible Data (PRD §7)
// ---------------------------------------------------------------------------

export const bibleTranslations = pgTable('bible_translations', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
  language: varchar('language', { length: 16 }).notNull(),
  license: text('license').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const bibleBooks = pgTable('bible_books', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull(),
  abbreviation: varchar('abbreviation', { length: 16 }).notNull(),
  testament: testamentEnum('testament').notNull(),
  bookOrder: integer('book_order').notNull(),
});

export const bibleVerses = pgTable(
  'bible_verses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    translationId: uuid('translation_id')
      .notNull()
      .references(() => bibleTranslations.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => bibleBooks.id, { onDelete: 'restrict' }),
    chapter: integer('chapter').notNull(),
    verse: integer('verse').notNull(),
    text: text('text').notNull(),
    wordCount: integer('word_count').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('bible_verses_translation_book_chapter_verse_idx').on(
      table.translationId,
      table.bookId,
      table.chapter,
      table.verse,
    ),
    index('bible_verses_book_chapter_verse_idx').on(
      table.bookId,
      table.chapter,
      table.verse,
    ),
    index('bible_verses_translation_id_idx').on(table.translationId),
  ],
);

// ---------------------------------------------------------------------------
// Topic Taxonomy (PRD §8)
// ---------------------------------------------------------------------------

export const topics = pgTable('topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull(),
  embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Verse–Topic Relationships (PRD §11)
// ---------------------------------------------------------------------------

export const verseTopics = pgTable(
  'verse_topics',
  {
    verseId: uuid('verse_id')
      .notNull()
      .references(() => bibleVerses.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    relevanceScore: real('relevance_score').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.verseId, table.topicId] }),
    index('verse_topics_topic_relevance_idx').on(
      table.topicId,
      table.relevanceScore,
    ),
    index('verse_topics_verse_id_idx').on(table.verseId),
  ],
);

export const feedItems = pgTable(
  'feed_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: feedItemTypeEnum('type').notNull().default('VERSE'),
    verseId: uuid('verse_id').references(() => bibleVerses.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('feed_items_type_verse_id_idx').on(table.type, table.verseId),
    uniqueIndex('feed_items_verse_id_unique_idx').on(table.verseId),
  ],
);

export const userOnboardingTopics = pgTable(
  'user_onboarding_topics',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.topicId] }),
    index('user_onboarding_topics_user_id_idx').on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// User Topic Affinity (PRD §16)
// ---------------------------------------------------------------------------

export const userTopicAffinities = pgTable(
  'user_topic_affinities',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    score: real('score').notNull().default(0),
    interactionCount: integer('interaction_count').notNull().default(0),
    lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.topicId] }),
    index('user_topic_affinities_user_score_idx').on(table.userId, table.score),
  ],
);

// ---------------------------------------------------------------------------
// Event Tracking (PRD §17)
// ---------------------------------------------------------------------------

export const userEvents = pgTable(
  'user_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    feedItemId: uuid('feed_item_id').references(() => feedItems.id, {
      onDelete: 'set null',
    }),
    verseId: uuid('verse_id').references(() => bibleVerses.id, {
      onDelete: 'set null',
    }),
    eventType: userEventTypeEnum('event_type').notNull(),
    requestId: uuid('request_id'),
    durationMs: integer('duration_ms'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('reading_event_retry_idx').on(table.userId, table.requestId),
    index('user_events_user_created_at_idx').on(table.userId, table.createdAt),
    index('user_events_verse_event_type_idx').on(table.verseId, table.eventType),
    index('user_events_feed_item_id_idx').on(table.feedItemId),
  ],
);

// ---------------------------------------------------------------------------
// Feed Sessions — cursor-based pagination (PRD §36)
// ---------------------------------------------------------------------------

export const feedSessions = pgTable(
  'feed_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cursor: text('cursor'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('feed_sessions_user_id_idx').on(table.userId),
    index('feed_sessions_expires_at_idx').on(table.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  onboardingTopics: many(userOnboardingTopics),
  topicAffinities: many(userTopicAffinities),
  events: many(userEvents),
  feedSessions: many(feedSessions),
}));

export const bibleTranslationsRelations = relations(
  bibleTranslations,
  ({ many }) => ({
    verses: many(bibleVerses),
  }),
);

export const bibleBooksRelations = relations(bibleBooks, ({ many }) => ({
  verses: many(bibleVerses),
}));

export const bibleVersesRelations = relations(bibleVerses, ({ one, many }) => ({
  translation: one(bibleTranslations, {
    fields: [bibleVerses.translationId],
    references: [bibleTranslations.id],
  }),
  book: one(bibleBooks, {
    fields: [bibleVerses.bookId],
    references: [bibleBooks.id],
  }),
  topics: many(verseTopics),
  feedItem: one(feedItems, {
    fields: [bibleVerses.id],
    references: [feedItems.verseId],
  }),
  events: many(userEvents),
}));

export const topicsRelations = relations(topics, ({ many }) => ({
  verseTopics: many(verseTopics),
  userAffinities: many(userTopicAffinities),
  onboardingSelections: many(userOnboardingTopics),
}));

export const verseTopicsRelations = relations(verseTopics, ({ one }) => ({
  verse: one(bibleVerses, {
    fields: [verseTopics.verseId],
    references: [bibleVerses.id],
  }),
  topic: one(topics, {
    fields: [verseTopics.topicId],
    references: [topics.id],
  }),
}));

export const feedItemsRelations = relations(feedItems, ({ one, many }) => ({
  verse: one(bibleVerses, {
    fields: [feedItems.verseId],
    references: [bibleVerses.id],
  }),
  events: many(userEvents),
}));

export const userOnboardingTopicsRelations = relations(
  userOnboardingTopics,
  ({ one }) => ({
    user: one(users, {
      fields: [userOnboardingTopics.userId],
      references: [users.id],
    }),
    topic: one(topics, {
      fields: [userOnboardingTopics.topicId],
      references: [topics.id],
    }),
  }),
);

export const userTopicAffinitiesRelations = relations(
  userTopicAffinities,
  ({ one }) => ({
    user: one(users, {
      fields: [userTopicAffinities.userId],
      references: [users.id],
    }),
    topic: one(topics, {
      fields: [userTopicAffinities.topicId],
      references: [topics.id],
    }),
  }),
);

export const userEventsRelations = relations(userEvents, ({ one }) => ({
  user: one(users, {
    fields: [userEvents.userId],
    references: [users.id],
  }),
  feedItem: one(feedItems, {
    fields: [userEvents.feedItemId],
    references: [feedItems.id],
  }),
  verse: one(bibleVerses, {
    fields: [userEvents.verseId],
    references: [bibleVerses.id],
  }),
}));

export const feedSessionsRelations = relations(feedSessions, ({ one }) => ({
  user: one(users, {
    fields: [feedSessions.userId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// Schema export
// ---------------------------------------------------------------------------

export const schema = {
  users,
  bibleTranslations,
  bibleBooks,
  bibleVerses,
  topics,
  verseTopics,
  feedItems,
  userOnboardingTopics,
  userTopicAffinities,
  userEvents,
  feedSessions,
};
