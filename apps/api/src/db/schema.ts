import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  primaryKey,
  check,
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
    installationId: text("installation_id"),
    lastCheck: text("last_check"),
    checkedAt: bigint("checked_at", { mode: "number" }),
  },
  (d) => [index("devices_owner_idx").on(d.owner), uniqueIndex("devices_owner_installation").on(d.owner, d.installationId)],
);

export const agreements = pgTable(
  "account_agreements",
  {
    id: text("id").primaryKey(),
    owner: text("owner")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    inviteAddress: text("invite_address").notNull(),
    recipient: text("recipient").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    status: partnerStatus("status").notNull(),
    scope: text("scope").notNull(),
    ownerAlertsAt: bigint("owner_alerts_at", { mode: "number" }),
    partnerAlertsAt: bigint("partner_alerts_at", { mode: "number" }),
    lastAlertAt: bigint("last_alert_at", { mode: "number" }),
    acceptedAt: bigint("accepted_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (a) => [
    uniqueIndex("agreements_active_pair")
      .on(a.owner, a.recipient)
      .where(sql`${a.status} in ('Pending','Connected')`),
    uniqueIndex("agreements_active_address")
      .on(a.owner, a.inviteAddress)
      .where(sql`${a.status} in ('Pending','Connected')`),
    index("agreements_recipient_idx").on(a.recipient),
  ],
);

export const weeklyReports = pgTable(
  "agreement_weekly_reports",
  {
    agreementId: text("agreement_id")
      .notNull()
      .references(() => agreements.id, { onDelete: "cascade" }),
    weekStart: bigint("week_start", { mode: "number" }).notNull(),
    groupedRequests: integer("grouped_requests").notNull(),
  },
  (r) => [
    primaryKey({ columns: [r.agreementId, r.weekStart] }),
    check("nonnegative_grouped_requests", sql`${r.groupedRequests} >= 0`),
  ],
);

// The pilot reports one explicitly mapped, paired iPhone per agreement.
export const reportingSources = pgTable("agreement_reporting_sources", {
  agreementId: text("agreement_id").primaryKey().references(() => agreements.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  registeredAt: bigint("registered_at", { mode: "number" }).notNull(),
  gatewayAccount: text("gateway_account").notNull(),
  registration: text("registration").notNull(),
  adultPolicy: text("adult_policy").notNull(),
});

export const partnerMail = pgTable(
  "partner_mail",
  {
    agreementId: text("agreement_id")
      .notNull()
      .references(() => agreements.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("weekly"),
    period: bigint("period", { mode: "number" }).notNull(),
    nextAttempt: bigint("next_attempt", { mode: "number" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
  },
  (row) => [
    primaryKey({ columns: [row.agreementId, row.kind, row.period] }),
    index("partner_mail_due").on(row.nextAttempt),
  ],
);

export const liveBlocks = pgTable(
  "agreement_live_blocks",
  {
    agreementId: text("agreement_id")
      .notNull()
      .references(() => reportingSources.agreementId, { onDelete: "cascade" }),
    domainKey: text("domain_key").notNull(),
    occurredAt: bigint("occurred_at", { mode: "number" }).notNull(),
  },
  (row) => [
    primaryKey({ columns: [row.agreementId, row.domainKey, row.occurredAt] }),
  ],
);
