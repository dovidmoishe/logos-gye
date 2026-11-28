import { createHmac, timingSafeEqual } from "node:crypto";
import express from "express";
import * as dns from "dns-packet";
import { Database } from "../db/connection";
import { recordBlock } from "./live";
import { reportScope } from "./week";

const adultList = 1001;
const diagnostic = "nudity.testcategory.com";

function config() {
  const origin = process.env.ADGUARD_PUBLIC_ORIGIN;
  const upstream = process.env.ADGUARD_INTERNAL_ORIGIN;
  const secret = process.env.ADGUARD_DEVICE_SECRET;
  if (!origin || !upstream || !secret || secret.length < 32) return;
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.href !== url.origin + "/")
    throw new Error("ADGUARD_PUBLIC_ORIGIN must be an HTTPS origin");
  return { origin: url.origin, upstream, secret };
}

function signature(id: string, secret: string) {
  return createHmac("sha256", secret)
    .update("resolver:" + id)
    .digest("base64url");
}

export function deviceResolver(id: string) {
  const settings = config();
  if (!settings) return null;
  return (
    settings.origin + "/dns-query/" + id + "." + signature(id, settings.secret)
  );
}

async function saveAdultBlock(
  db: Database,
  device: string,
  domain: string,
  time: number,
  secret: string,
) {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    // Moving the same phone from Gateway keeps its history. A second phone cannot claim the agreement.
    await client.query(
      `insert into agreement_reporting_sources(agreement_id,device_id,registered_at,gateway_account,registration,adult_policy)
       select a.id,d.id,$2,'adguard',d.id,'adult' from devices d join account_agreements a on a.owner=d.owner
       where d.id=$1 and d.installation_id is not null and a.status='Connected' and a.scope=$3 and a.accepted_at <= $2
       order by a.id for update of a,d
       on conflict (agreement_id) do update set gateway_account=excluded.gateway_account,
         registration=excluded.registration,adult_policy=excluded.adult_policy,registered_at=excluded.registered_at
       where agreement_reporting_sources.device_id=excluded.device_id and agreement_reporting_sources.gateway_account <> 'adguard' `,
      [device, time, reportScope],
    );
    await recordBlock(
      client,
      {
        account: "adguard",
        registration: device,
        policy: "adult",
        time,
        domain,
      },
      Date.now(),
      secret,
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export function adguardResolver(db: Database) {
  const router = express.Router();
  router.all(
    "/:token",
    express.raw({ type: "application/dns-message", limit: 65535 }),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      if (req.method !== "GET" && req.method !== "POST")
        return void res.sendStatus(405);
      const settings = config();
      if (!settings) return void res.sendStatus(503);
      const match = /^([0-9a-f-]{36})\.([\w-]{43})$/.exec(req.params.token);
      if (
        !match ||
        !timingSafeEqual(
          Buffer.from(match[2]),
          Buffer.from(signature(match[1], settings.secret)),
        )
      )
        return void res.sendStatus(403);
      const device = match[1];
      const encoded = req.query.dns;
      const wire: Buffer | undefined =
        req.method === "GET"
          ? typeof encoded === "string" &&
            encoded.length <= 87380 &&
            /^[\w-]+$/.test(encoded)
            ? Buffer.from(encoded, "base64url")
            : undefined
          : req.body;
      if (!Buffer.isBuffer(wire)) return void res.sendStatus(400);
      let query: dns.Packet;
      try {
        query = dns.decode(wire);
        if (query.type !== "query" || query.questions?.length !== 1)
          throw Error();
      } catch {
        return void res.sendStatus(400);
      }
      const time = Date.now();
      try {
        const registered = await db.pool.query(
          "select 1 from devices where id=$1 and installation_id is not null",
          [device],
        );
        if (!registered.rowCount) return void res.sendStatus(403);
        const reply = await fetch(new URL("/dns-query", settings.upstream), {
          method: "POST",
          headers: {
            "content-type": "application/dns-message",
            accept: "application/dns-message",
          },
          body: new Uint8Array(wire),
          signal: AbortSignal.timeout(5000),
          redirect: "error",
        });
        if (
          !reply.ok ||
          reply.headers.get("content-type")?.split(";")[0] !==
            "application/dns-message"
        )
          return void res.sendStatus(502);
        const bytes = Buffer.from(await reply.arrayBuffer());
        const answer = dns.decode(bytes);
        const question = query.questions![0];
        const domain = question.name.toLowerCase().replace(/\.$/, "");
        if (domain === diagnostic) {
          const status = await fetch(
            new URL("/control/filtering/status", settings.upstream),
            { signal: AbortSignal.timeout(3000) },
          );
          if (!status.ok) return void res.sendStatus(503);
          const filtering = (await status.json()) as {
            enabled: boolean;
            filters: { id: number; enabled: boolean; rules_count: number }[];
          };
          if (
            !filtering.enabled ||
            !filtering.filters.some(
              (f) => f.id === adultList && f.enabled && f.rules_count > 0,
            )
          )
            return void res.sendStatus(503);
        }
        // DNS protection must still respond if reporting or classification is unavailable.
        res.type("application/dns-message").send(bytes);
        if (
          domain === diagnostic ||
          !answer.answers?.some(
            (a) =>
              (a.type === "A" && a.data === "0.0.0.0") ||
              (a.type === "AAAA" && a.data === "::"),
          )
        )
          return;
        const check = new URL(
          "/control/filtering/check_host",
          settings.upstream,
        );
        check.searchParams.set("name", domain);
        check.searchParams.set("qtype", question.type);
        const result = await fetch(check, {
          signal: AbortSignal.timeout(3000),
          redirect: "error",
        });
        if (!result.ok) throw Error();
        const rule = (await result.json()) as {
          reason?: string;
          rules?: { filter_list_id: number }[];
        };
        if (
          rule.reason === "FilteredBlackList" &&
          rule.rules?.some((r) => r.filter_list_id === adultList)
        )
          await saveAdultBlock(db, device, domain, time, settings.secret);
      } catch {
        if (!res.headersSent) res.sendStatus(502);
        else console.warn("AdGuard block reporting unavailable.");
      }
    },
  );
  return router;
}
