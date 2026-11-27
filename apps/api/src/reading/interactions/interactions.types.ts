import {
  USER_EVENT_TYPES,
  UserEventType,
} from '../recommendations/recommendation.types';

export type InteractionEventInput = {
  requestId?: string;
  durationMs?: number;
  eventType: UserEventType;
  feedItemId?: string;
  metadata?: Record<string, unknown>;
  verseId?: string;
};

export type InteractionRequestBody =
  | InteractionEventInput
  | {
      events: InteractionEventInput[];
    };

export type InteractionResponse = {
  accepted: number;
  affinityUpdates: number;
  rejected: number;
};

export const isUserEventType = (value: unknown): value is UserEventType =>
  typeof value === 'string' &&
  USER_EVENT_TYPES.includes(value as UserEventType);
