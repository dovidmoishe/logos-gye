import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { accounts } from '../../db/schema';

import { users } from '../../db/scripture';
import { DATABASE } from '../database';
import type { AppDatabase } from '../database';
import { SUPABASE_JWT_VERIFIER } from './auth.constants';
import type { AuthJwtPayload, AuthUser, JwtVerifier } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    @Inject(SUPABASE_JWT_VERIFIER) private readonly jwtVerifier: JwtVerifier,
  ) {}

  async authenticateBearerToken(authorization?: string): Promise<AuthUser> {
    const token = this.extractBearerToken(authorization);
    const payload = await this.verifyToken(token);
    const userId = payload.sub;

    if (!userId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(userId)) {
      throw new UnauthorizedException('Auth token is missing a subject');
    }

    const email = this.getEmail(payload);
    const user = await this.upsertUser(userId, email);

    return user;
  }

  private extractBearerToken(authorization?: string): string {
    if (!authorization) {
      throw new UnauthorizedException('Authorization bearer token is required');
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Authorization must be a Bearer token');
    }

    return token;
  }

  private async verifyToken(token: string): Promise<AuthJwtPayload> {
    return this.jwtVerifier.verify(token);
  }

  private getEmail(payload: AuthJwtPayload): string {
    const email = payload.email;

    if (typeof email === 'string' && email.length > 0) {
      return email;
    }

    throw new UnauthorizedException('Auth token is missing an email claim');
  }

  private async upsertUser(id: string, email: string): Promise<AuthUser> {
    const ownerId = 'supabase:' + id;
    const username = email.toLowerCase();
    const [existing] = await this.db.select({ id: users.id, email: users.email })
      .from(users).innerJoin(accounts, eq(accounts.id, ownerId))
      .where(and(eq(users.id, id), eq(users.email, email), eq(accounts.username, username)));
    if (existing) return existing;

    return this.db.transaction(async tx => {
      const [user] = await tx.insert(users).values({ id, email })
        .onConflictDoUpdate({ target: users.id, set: { email, updatedAt: new Date() } })
        .returning({ id: users.id, email: users.email });
      await tx.insert(accounts).values({ id: ownerId, username, passwordHash: 'hosted' })
        .onConflictDoUpdate({ target: accounts.id, set: { username } });
      return user;
    });
  }
}
