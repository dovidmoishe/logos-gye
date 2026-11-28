import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import express, { type Request, type Response } from "express";
import type { PoolClient } from "pg";
import { Database } from "../db/connection";
import { monday, reportScope } from "./week";

const maxBytes = 6 * 1024 * 1024;
const retryWindow = 300000;
export const alertCooldown = 3600000;
type Block = {
  account: string;
  registration: string;
  policy: string;
  time: number;
  domain: string;
};

function records(data: Buffer, now: number): Block[] {
  const events: Block[] = [];
  const lines = data.toString("utf8").trim().split(/\r?\n/);
  if (lines.length > 1000) throw Error("Batch too large");
  for (const line of lines) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (
      row?.AccountID === "adguard" ||
      row?.ResolverDecision !== "blockedByCategory"
    )
      continue;
    if (
      ![
        row.AccountID,
        row.RegistrationID,
        row.PolicyID,
        row.QueryName,
        row.Datetime,
      ].every((v) => typeof v === "string" && v.length > 0 && v.length <= 254)
    )
      throw Error("Invalid event");
    const domain = row.QueryName.toLowerCase().replace(/\.$/, "");
    if (!domain || domain === "nudity.testcategory.com") continue;
    const time = Date.parse(row.Datetime);
    if (!Number.isFinite(time) || !row.Datetime.endsWith("Z"))
      throw Error("Invalid event time");
    if (time < monday(now) || time > now) continue;
    events.push({
      account: row.AccountID,
      registration: row.RegistrationID,
      policy: row.PolicyID,
      time,
      domain,
    });
  }
  return events.sort((a, b) => a.time - b.time);
}

export function gatewayReceiver(database: Database) {
  const router = express.Router();
  router.post(
    "/",
    (req, res, next) => {
      const secret = process.env.PARTNER_GATEWAY_SECRET;
      if (!secret || secret.length < 32) {
        res.sendStatus(503);
        return;
      }
      const hash = (value: string) =>
        createHash("sha256").update(value).digest();
      if (
        !timingSafeEqual(
          hash(req.get("authorization") || ""),
          hash("Bearer " + secret),
        )
      ) {
        res.sendStatus(401);
        return;
      }
      next();
    },
    express.raw({ type: () => true, limit: maxBytes }),
    async (req: Request, res: Response) => {
      const now = Date.now();
      let events: Block[];
      try {
        const raw = req.body;
        if (!Buffer.isBuffer(raw)) throw Error("Expected an export");
        const data =
          raw[0] === 31 && raw[1] === 139
            ? gunzipSync(raw, { maxOutputLength: maxBytes })
            : raw;
        events = records(data, now);
      } catch {
        res.sendStatus(400);
        return;
      }
      const client = await database.pool.connect();
      try {
        await client.query("begin");
        for (const e of events) {
          await recordBlock(
            client,
            e,
            now,
            process.env.PARTNER_GATEWAY_SECRET!,
          );
        }
        await client.query("commit");
        res.sendStatus(204);
      } catch {
        await client.query("rollback");
        res.sendStatus(503);
      } finally {
        client.release();
      }
    },
  );
  return router;
}

export async function recordBlock(
  client: PoolClient,
  e: Block,
  now: number,
  hashSecret: string,
) {
  const { rows } = await client.query(
    `
  select a.id,a.last_alert_at,a.owner_alerts_at,a.partner_alerts_at from agreement_reporting_sources s join account_agreements a on a.id=s.agreement_id
  where s.gateway_account=$1 and s.registration=$2 and s.adult_policy=$3 and s.registered_at <= $4
    and a.status='Connected' and a.scope=$5 and a.accepted_at <= $4
  order by a.id for update of a,s`,
    [e.account, e.registration, e.policy, e.time, reportScope],
  );
  for (const a of rows) {
    const key = createHmac("sha256", hashSecret)
      .update(a.id + "\0" + e.domain)
      .digest("hex");
    const neighbor = await client.query(
      `select 1 from agreement_live_blocks where agreement_id=$1 and domain_key=$2
    and occurred_at between $3 and $4 limit 1`,
      [
        a.id,
        key,
        Math.max(
          e.time - retryWindow,
          Number(a.owner_alerts_at),
          Number(a.partner_alerts_at),
        ),
        e.time + retryWindow,
      ],
    );
    const inserted = await client.query(
      "insert into agreement_live_blocks(agreement_id,domain_key,occurred_at) values($1,$2,$3) on conflict do nothing",
      [a.id, key, e.time],
    );
    const consented =
      a.owner_alerts_at != null &&
      a.partner_alerts_at != null &&
      e.time >=
        Math.max(Number(a.owner_alerts_at), Number(a.partner_alerts_at));
    if (
      !consented ||
      !inserted.rowCount ||
      neighbor.rowCount ||
      now - e.time > 15 * 60000 ||
      now - Number(a.last_alert_at) < alertCooldown
    )
      continue;
    await client.query(
      "update account_agreements set last_alert_at=$2 where id=$1",
      [a.id, now],
    );
    await client.query(
      "insert into partner_mail(agreement_id,kind,period,next_attempt) values($1,'check-in',$2,$2)",
      [a.id, now],
    );
  }
}
