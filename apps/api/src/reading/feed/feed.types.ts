export type FeedTopicDto = {
  id: string;
  name: string;
  relevanceScore: number;
  slug: string;
};

export type FeedVerseDto = {
  book: string;
  chapter: number;
  reference: string;
  text: string;
  translation: {
    code: string;
    name: string;
  };
  verse: number;
  verseId: string;
};

export type FeedScoreDto = {
  final: number;
  randomness: number;
  recentPenalty: number;
  topicAffinity: number;
};

export type FeedItemDto = {
  feedItemId: string;
  score: FeedScoreDto;
  topics: FeedTopicDto[];
  type: 'VERSE';
  verse: FeedVerseDto;
};

export type FeedResponseDto = {
  expiresAt: string;
  items: FeedItemDto[];
  nextCursor: string | null;
  sessionId: string;
};

export type FeedSessionState = {
  seenFeedItemIds: string[];
};
