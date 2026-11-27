import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

import type { JwtVerifier } from './auth.types';

@Injectable()
export class SupabaseJwtVerifier implements JwtVerifier {
  private readonly audience: string;
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor() {
    const supabaseUrl =
      process.env.SUPABASE_URL ?? 'https://gazplkkplxiavofhvupb.supabase.co';

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is not defined');
    }

    const normalizedUrl = supabaseUrl.replace(/\/$/, '');

    this.audience = process.env.SUPABASE_JWT_AUDIENCE ?? 'authenticated';
    this.issuer =
      process.env.SUPABASE_JWT_ISSUER ?? `${normalizedUrl}/auth/v1`;
    this.jwks = createRemoteJWKSet(
      new URL(`${normalizedUrl}/auth/v1/.well-known/jwks.json`),
    );
  }

  async verify(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        audience: this.audience,
        issuer: this.issuer,
        algorithms: ['ES256', 'RS256'],
        requiredClaims: ['exp', 'sub'],
      });

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired auth token');
    }
  }
}
