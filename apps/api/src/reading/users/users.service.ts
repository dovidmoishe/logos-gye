import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { users } from '../../db/scripture';
import { DATABASE } from '../database';
import type { AppDatabase } from '../database';
import type { UpdateUserProfileRequest, UserProfile } from './users.types';

const DISPLAY_NAME_MAX_LENGTH = 128;
const TIMEZONE_MAX_LENGTH = 64;

const USER_PROFILE_COLUMNS = {
  avatarUrl: users.avatarUrl,
  currentStreak: users.currentStreak,
  displayName: users.displayName,
  email: users.email,
  id: users.id,
  lastStreakDate: users.lastStreakDate,
  longestStreak: users.longestStreak,
  onboardingCompletedAt: users.onboardingCompletedAt,
  timezone: users.timezone,
  xp: users.xp,
};

@Injectable()
export class UsersService {
  constructor(@Inject(DATABASE) private readonly db: AppDatabase) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const [user] = await this.db
      .select(USER_PROFILE_COLUMNS)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundException('User was not found');
    }

    return this.toProfile(user);
  }

  async updateProfile(
    userId: string,
    body: UpdateUserProfileRequest,
  ): Promise<UserProfile> {
    const updates = this.toProfileUpdates(body);

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException(
        'At least one of displayName, avatarUrl, or timezone is required',
      );
    }

    const [user] = await this.db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning(USER_PROFILE_COLUMNS);

    if (!user) {
      throw new NotFoundException('User was not found');
    }

    return this.toProfile(user);
  }

  private toProfileUpdates(body: UpdateUserProfileRequest): {
    avatarUrl?: string | null;
    displayName?: string | null;
    timezone?: string | null;
  } {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be an object');
    }

    const updates: {
      avatarUrl?: string | null;
      displayName?: string | null;
      timezone?: string | null;
    } = {};

    if ('displayName' in body) {
      updates.displayName = this.parseOptionalText(
        body.displayName,
        'displayName',
        DISPLAY_NAME_MAX_LENGTH,
      );
    }

    if ('avatarUrl' in body) {
      updates.avatarUrl = this.parseOptionalAvatarUrl(body.avatarUrl);
    }

    if ('timezone' in body) {
      updates.timezone = this.parseOptionalTimezone(body.timezone);
    }

    return updates;
  }

  private parseOptionalText(
    value: unknown,
    field: string,
    maxLength: number,
  ): string | null {
    if (value === null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string or null`);
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return null;
    }

    if (trimmed.length > maxLength) {
      throw new BadRequestException(
        `${field} must be at most ${maxLength} characters`,
      );
    }

    return trimmed;
  }

  private parseOptionalAvatarUrl(value: unknown): string | null {
    const avatarUrl = this.parseOptionalText(value, 'avatarUrl', 2048);

    if (!avatarUrl) {
      return null;
    }

    let parsed: URL;

    try {
      parsed = new URL(avatarUrl);
    } catch {
      throw new BadRequestException('avatarUrl must be a valid URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('avatarUrl must be an http or https URL');
    }

    return parsed.toString();
  }

  private parseOptionalTimezone(value: unknown): string | null {
    const timezone = this.parseOptionalText(
      value,
      'timezone',
      TIMEZONE_MAX_LENGTH,
    );

    if (!timezone) {
      return null;
    }

    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      throw new BadRequestException('timezone must be a valid IANA time zone');
    }

    return timezone;
  }

  private toProfile(user: {
    avatarUrl: string | null;
    currentStreak: number;
    displayName: string | null;
    email: string;
    id: string;
    lastStreakDate: string | null;
    longestStreak: number;
    onboardingCompletedAt: Date | null;
    timezone: string | null;
    xp: number;
  }): UserProfile {
    return {
      avatarUrl: user.avatarUrl,
      currentStreak: user.currentStreak,
      displayName: user.displayName,
      email: user.email,
      id: user.id,
      lastStreakDate: user.lastStreakDate,
      longestStreak: user.longestStreak,
      onboardingCompletedAt: user.onboardingCompletedAt
        ? user.onboardingCompletedAt.toISOString()
        : null,
      timezone: user.timezone,
      xp: user.xp,
    };
  }
}
