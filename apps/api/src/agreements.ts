import {
  BadRequestException,
  Body,
  ConflictException,
  HttpException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { AccountService } from "./accounts";
import { Database } from "./db/connection";
import {
  accounts,
  agreements,
  partnerMail,
  reportingSources,
  weeklyReports,
} from "./db/schema";

import { isMailbox } from "./reporting/mail";
import { day, week, monday, reportScope as scope } from "./reporting/week";

type Party = { id: string; username: string };
function addressedTo(party: Party) {
  return or(
    eq(agreements.recipient, party.id),
    and(
      isNull(agreements.recipient),
      eq(agreements.status, "Pending"),
      eq(agreements.inviteAddress, party.username),
    ),
  );
}
@Injectable()
export class Agreements {
  constructor(private readonly database: Database) {}
  private get db() {
    return this.database.db;
  }
  private async expire(user: Party) {
    await this.db
      .update(agreements)
      .set({ status: "Expired" })
      .where(
        and(
          or(eq(agreements.owner, user.id), addressedTo(user)),
          eq(agreements.status, "Pending"),
          lte(agreements.expiresAt, Date.now()),
        ),
      );
  }
  async list(user: Party) {
    await this.expire(user);
    const owner = alias(accounts, "sender"),
      recipient = alias(accounts, "receiver");
    return this.db
      .select({
        id: agreements.id,
        owner: owner.username,
        recipient: sql<string>`coalesce(${recipient.username}, ${agreements.inviteAddress})`,
        createdAt: agreements.createdAt,
        status: agreements.status,
        scope: agreements.scope,
        expiresAt: agreements.expiresAt,
      })
      .from(agreements)
      .innerJoin(owner, eq(owner.id, agreements.owner))
      .leftJoin(recipient, eq(recipient.id, agreements.recipient))
      .where(or(eq(agreements.owner, user.id), addressedTo(user)))
      .orderBy(desc(agreements.createdAt));
  }
  async invite(user: Party, username: unknown, acceptedScope: unknown) {
    if (acceptedScope !== scope || typeof username !== "string")
      throw new BadRequestException(
        "Confirm the weekly report scope and enter a partner username.",
      );
    const address = username.trim().toLowerCase();
    if (!address || address.length > 254)
      throw new BadRequestException("Enter a partner email or pilot username.");
    const [recipient] = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.username, address));
    if (!recipient && !isMailbox(address))
      throw new NotFoundException("Partner account unavailable.");
    if (recipient?.id === user.id)
      throw new BadRequestException("Choose another account.");
    await this.expire(user);
    const now = Date.now();
    await this.db.transaction(async (tx) => {
      // Serialize the per-sender invitation budget across API instances.
      await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.id, user.id))
        .for("update");
      const [recent] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(agreements)
        .where(
          and(
            eq(agreements.owner, user.id),
            gt(agreements.createdAt, now - 3600000),
          ),
        );
      if (recent.count >= 20)
        throw new HttpException("Try inviting more partners later.", 429);
      const [created] = await tx
        .insert(agreements)
        .values({
          id: randomUUID(),
          owner: user.id,
          recipient: recipient?.id ?? null,
          inviteAddress: address,
          status: "Pending",
          scope,
          createdAt: now,
          expiresAt: now + week,
        })
        .onConflictDoNothing()
        .returning({ id: agreements.id });
      if (!created)
        throw new ConflictException(
          "An active invitation or connection already exists.",
        );
      if (isMailbox(address)) {
        await tx
          .insert(partnerMail)
          .values({ agreementId: created.id, period: 0, nextAttempt: now });
      }
    });
    return this.list(user);
  }
  async weeklyReport(user: Party, id: string) {
    const currentMonday = monday(Date.now());
    const weekStart = currentMonday - week;
    const [row] = await this.db
      .select({
        acceptedAt: agreements.acceptedAt,
        count: weeklyReports.groupedRequests,
      })
      .from(agreements)
      .leftJoin(
        weeklyReports,
        and(
          eq(agreements.id, weeklyReports.agreementId),
          eq(weeklyReports.weekStart, weekStart),
          lte(agreements.acceptedAt, weekStart),
        ),
      )
      .where(
        and(
          eq(agreements.id, id),
          eq(agreements.scope, scope),
          eq(agreements.status, "Connected"),
          or(eq(agreements.owner, user.id), eq(agreements.recipient, user.id)),
        ),
      );
    if (!row) throw new NotFoundException("Weekly report unavailable.");
    if (row.acceptedAt == null || row.acceptedAt > weekStart) {
      const firstWeek =
        Math.ceil(((row.acceptedAt ?? Date.now()) - 4 * day) / week) * week +
        4 * day;
      return {
        status: "awaiting_first_week",
        weekStart: firstWeek,
        weekEnd: firstWeek + week,
        groupedRequests: null,
      };
    }
    return {
      status: row.count == null ? "unavailable" : "available",
      weekStart,
      weekEnd: currentMonday,
      groupedRequests: row.count,
    };
  }
  async respond(
    user: Party,
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
            eq(agreements.owner, user.id),
            and(
              eq(agreements.recipient, user.id),
              eq(agreements.status, "Connected"),
            ),
          )
        : addressedTo(user);
    const eligible =
      action === "revoke"
        ? inArray(agreements.status, ["Pending", "Connected"])
        : and(
            eq(agreements.status, "Pending"),
            gt(agreements.expiresAt, Date.now()),
          );
    await this.db.transaction(async (tx) => {
      const changed = await tx
        .update(agreements)
        .set({
          ...(action === "revoke" ? {} : { recipient: user.id }),
          ...(action === "accept" ? { acceptedAt: Date.now() } : {}),
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
      await tx.delete(partnerMail).where(eq(partnerMail.agreementId, id));
      if (action === "revoke") {
        await tx
          .delete(reportingSources)
          .where(eq(reportingSources.agreementId, id));
        await tx.delete(weeklyReports).where(eq(weeklyReports.agreementId, id));
      }
    });
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
    return this.agreements.list(await this.accounts.owner(req));
  }
  @Get(":id/report") async report(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    return this.agreements.weeklyReport(await this.accounts.owner(req), id);
  }
  @Post() async invite(
    @Req() req: Request,
    @Body("username") username: unknown,
    @Body("scope") scope: unknown,
  ) {
    return this.agreements.invite(
      await this.accounts.owner(req),
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
      await this.accounts.owner(req),
      id,
      action,
      scope,
    );
  }
}
