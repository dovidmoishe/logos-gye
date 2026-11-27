import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  pgEnum,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const partnerStatus = pgEnum("partner_status", [
  "Pending",
  "Connected",
  "Declined",
  "Revoked",
  "Expired",
]);
export const partners = pgTable(
  "partners",
  {
    id: text("id").primaryKey(),
    workspace: text("workspace").notNull(),
    email: text("email").notNull(),
    status: partnerStatus("status").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    sequence: serial("sequence").notNull(),
  },
  (table) => [
    index("partners_workspace_sequence_idx").on(
      table.workspace,
      table.sequence,
    ),
    uniqueIndex("partners_active_email_idx")
      .on(table.workspace, table.email)
      .where(sql`${table.status} in ('Pending','Connected')`),
  ],
);

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});
export const sessions = pgTable("account_sessions", {
  digest: text("digest").primaryKey(),
  owner: text("owner")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});
export const devices = pgTable(
  "devices",
  {
    id: text("id").primaryKey(),
    owner: text("owner")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    pairingDigest: text("pairing_digest").unique(),
    pairingExpiresAt: bigint("pairing_expires_at", {
      mode: "number",
    }).notNull(),
    credentialDigest: text("credential_digest").unique(),
    lastCheck: text("last_check"),
    checkedAt: bigint("checked_at", { mode: "number" }),
  },
  (d) => [index("devices_owner_idx").on(d.owner)],
);

export const agreements = pgTable(
  "account_agreements",
  {
    id: text("id").primaryKey(),
    owner: text("owner")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    recipient: text("recipient")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    status: partnerStatus("status").notNull(),
    scope: text("scope").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (a) => [
    uniqueIndex("agreements_active_pair")
      .on(a.owner, a.recipient)
      .where(sql`${a.status} in ('Pending','Connected')`),
    index("agreements_recipient_idx").on(a.recipient),
  ],
);
