export const MIN_ONBOARDING_TOPICS = 0;
export const MAX_ONBOARDING_TOPICS = 10;

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TopicDto = {
  description: string;
  id: string;
  name: string;
  slug: string;
};

export type TopicsResponse = {
  topics: TopicDto[];
};

export type SaveOnboardingTopicsRequest = {
  topicIds: string[];
};

export type SaveOnboardingTopicsResponse = {
  onboardingCompletedAt: string;
  topics: TopicDto[];
};
