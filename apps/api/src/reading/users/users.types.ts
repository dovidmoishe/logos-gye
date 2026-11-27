export type UserProfile = {
  avatarUrl: string | null;
  currentStreak: number;
  displayName: string | null;
  email: string;
  id: string;
  lastStreakDate: string | null;
  longestStreak: number;
  onboardingCompletedAt: string | null;
  timezone: string | null;
  xp: number;
};

export type UpdateUserProfileRequest = {
  avatarUrl?: string | null;
  displayName?: string | null;
  timezone?: string | null;
};

