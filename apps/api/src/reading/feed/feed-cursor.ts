import { FeedSessionState } from './feed.types';

export const DEFAULT_FEED_LIMIT = 10;
export const MAX_FEED_LIMIT = 20;
export const FEED_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_SESSION_SEEN_ITEMS = 500;

export const clampFeedLimit = (value: unknown): number => {
  const parsed = Number(value ?? DEFAULT_FEED_LIMIT);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_FEED_LIMIT;
  }

  return Math.max(1, Math.min(MAX_FEED_LIMIT, Math.floor(parsed)));
};

export const encodeFeedCursor = (sessionId: string): string =>
  Buffer.from(JSON.stringify({ sessionId }), 'utf8').toString('base64url');

export const decodeFeedCursor = (cursor: string): string | null => {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { sessionId?: unknown };

    return typeof decoded.sessionId === 'string' ? decoded.sessionId : null;
  } catch {
    return null;
  }
};

export const createEmptySessionState = (): FeedSessionState => ({
  seenFeedItemIds: [],
});

export const parseSessionState = (cursor: string | null): FeedSessionState => {
  if (!cursor) {
    return createEmptySessionState();
  }

  try {
    const parsed = JSON.parse(cursor) as FeedSessionState;

    if (!Array.isArray(parsed.seenFeedItemIds)) {
      return createEmptySessionState();
    }

    return {
      seenFeedItemIds: parsed.seenFeedItemIds.filter(
        (id): id is string => typeof id === 'string',
      ),
    };
  } catch {
    return createEmptySessionState();
  }
};

export const serializeSessionState = (
  previous: FeedSessionState,
  newFeedItemIds: string[],
): string =>
  JSON.stringify({
    seenFeedItemIds: [
      ...previous.seenFeedItemIds,
      ...newFeedItemIds,
    ].slice(-MAX_SESSION_SEEN_ITEMS),
  } satisfies FeedSessionState);
