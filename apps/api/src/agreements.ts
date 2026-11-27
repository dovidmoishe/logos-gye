import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { and, desc, eq, gt, inArray, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { AccountService } from "./accounts";
import { Database } from "./db/connection";
import { accounts, agreements } from "./db/schema";

const scope = "weekly-blocked-counts-v1";
@Injectable()
export class Agreements {
  constructor(private readonly database: Database) {}
  private get db() {
    return this.database.db;
  }
  private async expire(user: string) {
    await this.db
      .update(agreements)
      .set({ status: "Expired" })
      .where(
        and(
          or(eq(agreements.owner, user), eq(agreements.recipient, user)),
          eq(agreements.status, "Pending"),
          lte(agreements.expiresAt, Date.now()),
        ),
      );
  }
  async list(user: string) {
    await this.expire(user);
    const owner = alias(accounts, "sender"),
      recipient = alias(accounts, "receiver");
    return this.db
      .select({
        id: agreements.id,
        owner: owner.username,
        recipient: recipient.username,
        status: agreements.status,
        scope: agreements.scope,
        expiresAt: agreements.expiresAt,
      })
      .from(agreements)
      .innerJoin(owner, eq(owner.id, agreements.owner))
      .innerJoin(recipient, eq(recipient.id, agreements.recipient))
      .where(or(eq(agreements.owner, user), eq(agreements.recipient, user)))
      .orderBy(desc(agreements.createdAt));
  }
  async invite(user: string, username: unknown, acceptedScope: unknown) {
    if (acceptedScope !== scope || typeof username !== "string")
      throw new BadRequestException(
        "Confirm the weekly report scope and enter a partner username.",
      );
    const [recipient] = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.username, username.trim().toLowerCase()));
    if (!recipient) throw new NotFoundException("Partner account unavailable.");
    if (recipient.id === user)
      throw new BadRequestException("Choose another account.");
    await this.expire(user);
    const now = Date.now();
    const created = await this.db
      .insert(agreements)
      .values({
        id: randomUUID(),
        owner: user,
        recipient: recipient.id,
        status: "Pending",
        scope,
        createdAt: now,
        expiresAt: now + 7 * 86400000,
      })
      .onConflictDoNothing()
      .returning({ id: agreements.id });
    if (!created.length)
      throw new ConflictException(
        "An active invitation or connection already exists.",
      );
    return this.list(user);
  }
  async respond(
    user: string,
    id: string,
    action: unknown,
    acceptedScope: unknown,
  ) {
    if (action !== "accept" && action !== "decline" && action !== "revoke")
      throw new BadRequestException();
    if (action === "accept" && acceptedScope !== scope)
      throw new BadRequestException("Review the agreement before accepting.");
    await this.expire(user);
    const permitted =
      action === "revoke"
        ? or(
            eq(agreements.owner, user),
            and(
              eq(agreements.recipient, user),
              eq(agreements.status, "Connected"),
            ),
          )
        : eq(agreements.recipient, user);
    const eligible =
      action === "revoke"
        ? inArray(agreements.status, ["Pending", "Connected"])
        : and(
            eq(agreements.status, "Pending"),
            gt(agreements.expiresAt, Date.now()),
          );
    const changed = await this.db
      .update(agreements)
      .set({
        status:
          action === "accept"
            ? "Connected"
            : action === "decline"
              ? "Declined"
              : "Revoked",
      })
      .where(
        and(
          eq(agreements.id, id),
          eq(agreements.scope, scope),
          permitted,
          eligible,
        ),
      )
      .returning({ id: agreements.id });
    if (!changed.length)
      throw new NotFoundException("Agreement unavailable for this action.");
    return this.list(user);
  }
}
@Controller("api/account/agreements")
export class AgreementsController {
  constructor(
    private readonly accounts: AccountService,
    private readonly agreements: Agreements,
  ) {}
  @Get() async list(@Req() req: Request) {
    return this.agreements.list(
      (await this.accounts.owner(req)).id,
    );
  }
  @Post() async invite(
    @Req() req: Request,
    @Body("username") username: unknown,
    @Body("scope") scope: unknown,
  ) {
    return this.agreements.invite(
      (await this.accounts.owner(req)).id,
      username,
      scope,
    );
  }
  @Patch(":id") async respond(
    @Req() req: Request,
    @Param("id") id: string,
    @Body("action") action: unknown,
    @Body("scope") scope: unknown,
  ) {
    return this.agreements.respond(
      (await this.accounts.owner(req)).id,
      id,
      action,
      scope,
    );
  }
}
