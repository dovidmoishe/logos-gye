export type AuthUser = {
  email: string;
  id: string;
};

export type AuthJwtPayload = {
  email?: unknown;
  sub?: string;
  user_metadata?: unknown;
};

export type RequestWithUser = {
  user?: AuthUser;
};

export type JwtVerifier = {
  verify(token: string): Promise<AuthJwtPayload>;
};
