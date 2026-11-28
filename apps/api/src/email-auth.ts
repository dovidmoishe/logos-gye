import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpException,
  HttpCode,
  Injectable,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { sql, lt } from "drizzle-orm";
import type { Request, Response } from "express";
import { Senviok } from "senviok";
import { digest, sessionCookie, sessionLifetime } from "./session";
import { Database } from "./db/connection";
import { loginChallenges, sessions } from "./db/schema";
import { partnerEmailTransport } from "./reporting/partner-email";

const minute = 60_000;
function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    email.length > 254 ||
    !/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email)
  )
    throw new BadRequestException("Enter a valid email address.");
  return email;
}
const invalidCode = () =>
  new UnauthorizedException(
    "Invalid or expired code. Request a new code if needed.",
  );

@Injectable()
export class SignInMail {
  async send(email: string, code: string) {
    const from = process.env.PARTNER_MAIL_FROM;
    const key = process.env.SENVIOK_API_KEY;
    const message = {
      to: email,
      subject: "Your Logos sign-in code",
      text: `Your Logos sign-in code:\n\n${code}\n\nIt expires in 10 minutes. If you didn’t request it, you can ignore this email.`,
    };
    try {
      if (!from) throw Error();
      if (key) {
        const pending = new Senviok(key).emails.send({ from, ...message });
        const timeout = setTimeout(() => pending.cancel(), 10_000);
        try {
          await pending;
        } finally {
          clearTimeout(timeout);
        }
      } else {
        const transport = partnerEmailTransport(
          from,
          undefined,
          process.env.PARTNER_SMTP_URL,
        );
        if (!transport) throw Error();
        try {
          await transport.send({
            ...message,
            messageId: randomBytes(16).toString("hex") + "@withlogos.app",
          });
        } finally {
          transport.close();
        }
      }
    } catch {
      // Provider errors may include the full message. Never log the OTP.
      throw new ServiceUnavailableException(
        "Email delivery is unavailable. Please try again shortly.",
      );
    }
  }
}

@Controller("api/auth")
export class EmailAuthController {
  private nextCleanup = 0;
  constructor(
    private readonly database: Database,
    private readonly mail: SignInMail,
  ) {}

  private async clearExpired(now: number) {
    if (now < this.nextCleanup) return;
    this.nextCleanup = now + 60 * minute;
    await this.database.db
      .delete(loginChallenges)
      .where(lt(loginChallenges.sentAt, now - 86400_000));
    await this.database.db.delete(sessions).where(lt(sessions.expiresAt, now));
  }

  @Post("otp")
  @HttpCode(200)
  async request(@Body("email") input: unknown) {
    const email = normalizeEmail(input);
    const challenge = randomBytes(32).toString("base64url");
    const challengeHash = digest(challenge);
    const code = randomInt(100_000_000).toString().padStart(8, "0");
    const codeHash = digest(challenge + code);
    const now = Date.now();
    await this.clearExpired(now);
    const hourAgo = now - 60 * minute;
    const result = await this.database.pool.query(
      `
      insert into login_challenges(email,challenge_hash,code_hash,sent_at,window_start,sends,attempts)
      values ($1,$2,$3,$4,$4,1,0)
      on conflict (email) do update set challenge_hash=excluded.challenge_hash, code_hash=excluded.code_hash,
        sent_at=excluded.sent_at, attempts=0,
        sends=case when login_challenges.window_start <= $5 then 1 else login_challenges.sends+1 end,
        window_start=case when login_challenges.window_start <= $5 then excluded.sent_at else login_challenges.window_start end
      where login_challenges.sent_at <= $6 and (login_challenges.window_start <= $5 or login_challenges.sends < 5)
    `,
      [email, challengeHash, codeHash, now, hourAgo, now - minute],
    );
    if (!result.rowCount)
      throw new HttpException(
        "Please wait before requesting another code.",
        429,
      );
    await this.mail.send(email, code);
    return { challenge };
  }

  @Post("verify")
  @HttpCode(200)
  async verify(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = normalizeEmail(body?.email);
    const { challenge, token } = body;
    if (
      typeof challenge !== "string" ||
      !/^[\w-]{43}$/.test(challenge) ||
      typeof token !== "string" ||
      !/^\d{8}$/.test(token)
    )
      throw invalidCode();
    const now = Date.now();
    const session = await this.database.db.transaction(async (tx) => {
      // UPDATE locks the challenge. Wrong guesses commit and concurrent verification has one winner.
      const attempt = await tx.execute(sql`
        update login_challenges set attempts=attempts+1 where email=${email}
        and challenge_hash=${digest(challenge)} and sent_at > ${now - 10 * minute}
        and attempts < 5 returning code_hash
      `);
      const stored = attempt.rows[0]?.code_hash;
      if (
        typeof stored !== "string" ||
        !timingSafeEqual(
          Buffer.from(stored),
          Buffer.from(digest(challenge + token)),
        )
      )
        return null;
      await tx.execute(
        sql`update login_challenges set attempts=5,code_hash='' where email=${email}`,
      );
      const existing = await tx.execute(
        sql`select id,email from users where lower(email)=${email} limit 2`,
      );
      if (existing.rows.length > 1)
        throw new ConflictException(
          "This email matches multiple profiles. Contact Logos support.",
        );
      const user =
        existing.rows[0] ??
        (
          await tx.execute(
            sql`insert into users(email) values(${email}) returning id,email`,
          )
        ).rows[0];
      // Keep the existing owner namespace so agreements and devices retain their foreign keys.
      const owner = "supabase:" + user.id;
      await tx.execute(
        sql`insert into accounts(id,username,password_hash) values(${owner},${email},'email-only') on conflict (id) do nothing`,
      );
      const secret = "logos_" + randomBytes(32).toString("base64url");
      await tx
        .insert(sessions)
        .values({
          owner,
          digest: digest(secret),
          expiresAt: now + sessionLifetime,
        });
      return {
        access_token: secret,
        expires_at: Math.floor((now + sessionLifetime) / 1000),
        user: { id: user.id, email },
      };
    });
    if (!session) throw invalidCode();
    if (body.client === "web") {
      res.cookie("logos_session", session.access_token, {
        ...sessionCookie,
        maxAge: sessionLifetime,
      });
      return { user: session.user };
    }
    return session;
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request) {
    const token = req.headers.authorization?.match(
      /^Bearer (logos_[\w-]{43})$/,
    )?.[1];
    if (token)
      await this.database.pool.query(
        "delete from account_sessions where digest=$1",
        [digest(token)],
      );
  }
}
