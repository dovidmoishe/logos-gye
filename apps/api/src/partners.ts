import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Database } from "./db/connection";
import { partners } from "./db/schema";

@Injectable()
export class Partners {
  constructor(private readonly database: Database) {}
  private expire(workspace: string) {
    return this.database.db
      .update(partners)
      .set({ status: "Expired" })
      .where(
        and(
          eq(partners.workspace, workspace),
          eq(partners.status, "Pending"),
          lte(partners.expiresAt, Date.now()),
        ),
      );
  }
  async list(workspace: string) {
    await this.expire(workspace);
    return this.database.db
      .select({
        id: partners.id,
        email: partners.email,
        status: partners.status,
        expiresAt: partners.expiresAt,
      })
      .from(partners)
      .where(eq(partners.workspace, workspace))
      .orderBy(desc(partners.sequence));
  }
  async invite(workspace: string, address: unknown) {
    const email =
      typeof address === "string" ? address.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      throw new BadRequestException("Enter a valid demo email.");
    await this.expire(workspace);
    const inserted = await this.database.db
      .insert(partners)
      .values({
        id: randomUUID(),
        workspace,
        email,
        status: "Pending",
        expiresAt: Date.now() + 7 * 86400000,
      })
      .onConflictDoNothing()
      .returning({ id: partners.id });
    if (!inserted.length)
      throw new ConflictException(
        "This partner already has an invitation or connection.",
      );
    return this.list(workspace);
  }
  async change(workspace: string, id: string, action: unknown) {
    const status =
      action === "accept"
        ? "Connected"
        : action === "decline"
          ? "Declined"
          : action === "revoke"
            ? "Revoked"
            : null;
    if (!status) throw new BadRequestException();
    await this.expire(workspace);
    const scoped = and(eq(partners.workspace, workspace), eq(partners.id, id));
    const changed = await this.database.db
      .update(partners)
      .set({ status })
      .where(
        and(
          scoped,
          inArray(
            partners.status,
            status === "Revoked" ? ["Connected", "Pending"] : ["Pending"],
          ),
        ),
      )
      .returning({ id: partners.id });
    if (!changed.length) {
      const found = await this.database.db
        .select({ id: partners.id })
        .from(partners)
        .where(scoped);
      if (!found.length) throw new NotFoundException();
      throw new ConflictException("This agreement has already changed.");
    }
    return this.list(workspace);
  }
  async clear(workspace: string) {
    await this.database.db
      .delete(partners)
      .where(eq(partners.workspace, workspace));
    return [];
  }
}
