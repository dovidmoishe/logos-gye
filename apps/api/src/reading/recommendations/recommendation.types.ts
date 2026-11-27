export const USER_EVENT_TYPES = [
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
] as const;

export type UserEventType = (typeof USER_EVENT_TYPES)[number];

export type AffinityEvent = {
  durationMs?: number;
  eventType: UserEventType;
  verseId?: string;
};
