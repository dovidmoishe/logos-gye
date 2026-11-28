import { createHash } from "node:crypto";

export const sessionLifetime = 30 * 86400_000;
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const sessionCookie = {
  httpOnly: true,
  sameSite: "strict" as const,
  path: "/api/account",
  secure: process.env.COOKIE_SECURE === "true",
};
