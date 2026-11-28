import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { Database } from "../db/connection";
import { day, monday, reportScope, week } from "./week";

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const fixture = "nudity.testcategory.com";
type Source = { account: string; registration: string; policy: string };
type DayProof = {
  start: string;
  completeCoverage: boolean;
  rows: number;
  sha256: string;
};
type Manifest = Source & { weekStart: string; days: DayProof[] };

// Only an operator with database access can bind a Gateway registration. The
// database timestamp prevents a new binding from importing an earlier week.
export async function bindSource(
  database: Database,
  agreement: string,
  device: string,
  source: Source,
) {
  if (
    !/^[a-f0-9]{32}$/.test(source.account) ||
    !uuid.test(source.registration) ||
    !uuid.test(source.policy)
  )
    throw new Error(
      "Invalid Gateway account, registration or policy identifier.",
    );
  await database.db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${source.account + source.registration}))`,
    );
    const existing =
      await tx.execute(sql`select 1 from agreement_reporting_sources
      where gateway_account=${source.account} and registration=${source.registration} and device_id<>${device}`);
    if (existing.rowCount)
      throw new Error("Registration already belongs to another device.");
    const result = await tx.execute(sql`
      insert into agreement_reporting_sources(agreement_id,device_id,registered_at,gateway_account,registration,adult_policy)
      select a.id,d.id,(extract(epoch from clock_timestamp())*1000)::bigint,${source.account},${source.registration},${source.policy}
      from account_agreements a join devices d on d.owner=a.owner
      where a.id=${agreement} and a.status='Connected' and a.scope=${reportScope}
        and d.id=${device} and (d.credential_digest is not null or d.installation_id is not null)
      for update of a,d
      on conflict do nothing returning agreement_id`);
    if (!result.rowCount)
      throw new Error(
        "A new binding requires an accepted agreement and its owner's paired device.",
      );
  });
}

function parseJSON(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Invalid export JSON.");
  }
}
function timestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)
  )
    return NaN;
  return Date.parse(value);
}

// Group consecutive requests to the same normalized name with at most five
// minutes between them. Sorting handles overlapping exports and A/AAAA retries.
function countGroups(events: Map<string, number[]>) {
  let count = 0;
  for (const times of events.values()) {
    let previous = -Infinity;
    for (const time of times.sort((a, b) => a - b)) {
      if (time - previous > 300000) count++;
      previous = time;
    }
  }
  return count;
}

function collect(
  data: Buffer,
  source: Source,
  start: number,
  end: number,
  probe: boolean,
  events: Map<string, number[]>,
) {
  let rows = 0;
  for (const line of data.toString("utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = parseJSON(line);
    const time = timestamp(row?.Datetime);
    if (
      row?.AccountID !== source.account ||
      row.RegistrationID !== source.registration ||
      row.PolicyID !== source.policy ||
      row.ResolverDecision !== "blockedByCategory" ||
      !Number.isFinite(time) ||
      time < start ||
      time >= end ||
      typeof row.QueryName !== "string" ||
      !row.QueryName.trim() ||
      row.QueryName.length > 254
    ) {
      throw new Error(
        "Export contains a record outside the expected device, policy, decision or interval.",
      );
    }
    rows++;
    const domain = row.QueryName.toLowerCase().replace(/\.$/, "");
    if (probe && domain !== fixture)
      throw new Error(
        "The diagnostic export must contain only the harmless fixture.",
      );
    if (!probe && domain === fixture) continue;
    let times = events.get(domain);
    if (!times) {
      times = [];
      events.set(domain, times);
    }
    times.push(time);
  }
  return rows;
}

export async function importWeek(
  database: Database,
  agreement: string,
  directory: string,
) {
  const manifest = parseJSON(
    await readFile(join(directory, "manifest.json"), "utf8"),
  ) as Manifest;
  const start = timestamp(manifest?.weekStart);
  if (
    start !== monday(Date.now()) - week ||
    !Array.isArray(manifest.days) ||
    manifest.days.length !== 7
  )
    throw new Error(
      "Expected all seven days of the latest completed UTC week.",
    );

  const client = await database.pool.connect();
  try {
    await client.query("begin");
    const {
      rows: [source],
    } = await client.query(
      `
      select s.gateway_account as account,s.registration,s.adult_policy as policy,a.invite_address
      from agreement_reporting_sources s join account_agreements a on a.id=s.agreement_id
      join devices d on d.id=s.device_id and d.owner=a.owner
      where a.id=$1 and a.scope=$2 and a.status='Connected' and a.accepted_at <= $3
        and s.registered_at <= $3 and (d.credential_digest is not null or d.installation_id is not null) for update of a,s,d`,
      [agreement, reportScope, start],
    );
    if (
      !source ||
      source.account !== manifest.account ||
      source.registration !== manifest.registration ||
      source.policy !== manifest.policy
    )
      throw new Error(
        "A matching, consented device source must cover the entire week.",
      );
    const events = new Map<string, number[]>();
    let totalBytes = 0;
    for (let i = 0; i < 7; i++) {
      const proof = manifest.days[i];
      const from = start + i * day;
      if (
        timestamp(proof?.start) !== from ||
        proof.completeCoverage !== true ||
        !Number.isSafeInteger(proof.rows) ||
        proof.rows < 0
      )
        throw new Error(
          "A day is missing independent coverage or export evidence.",
        );
      const file = join(
        directory,
        new Date(from).toISOString().slice(0, 10) + ".ndjson",
      );
      totalBytes += (await stat(file)).size;
      if (totalBytes > 32 * 1024 * 1024)
        throw new Error("Weekly export exceeds the single-device pilot limit.");
      const data = await readFile(file);
      if (
        createHash("sha256").update(data).digest("hex") !== proof.sha256 ||
        collect(data, source, from, from + day, false, events) !== proof.rows
      )
        throw new Error("Export checksum or expected row count differs.");
    }
    const count = countGroups(events);
    const result = await client.query(
      `
      insert into agreement_weekly_reports(agreement_id,week_start,grouped_requests)
      values($1,$2,$3) on conflict do nothing returning week_start`,
      [agreement, start, count],
    );
    if (result.rowCount) {
      await client.query(
        "insert into partner_mail(agreement_id,period,next_attempt) values($1,$2,$3)",
        [agreement, start, Date.now()],
      );
    } else {
      const {
        rows: [prior],
      } = await client.query(
        "select grouped_requests from agreement_weekly_reports where agreement_id=$1 and week_start=$2",
        [agreement, start],
      );
      if (prior.grouped_requests !== count)
        throw new Error("Export conflicts with the published count.");
    }
    await client.query("commit");
    return count;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function checkFixture(
  database: Database,
  agreement: string,
  file: string,
) {
  const {
    rows: [source],
  } = await database.pool.query(
    `
    select s.gateway_account as account,s.registration,s.adult_policy as policy,s.registered_at
    from agreement_reporting_sources s join account_agreements a on a.id=s.agreement_id
    where a.id=$1 and a.status='Connected' and a.scope=$2`,
    [agreement, reportScope],
  );
  if (!source) throw new Error("No connected device source.");
  const events = new Map<string, number[]>();
  const requests = collect(
    await readFile(file),
    source,
    Number(source.registered_at),
    Date.now() + 1,
    true,
    events,
  );
  if (!requests) throw new Error("No attributed fixture requests found.");
  return { requests, groups: countGroups(events) };
}

async function main() {
  const [action, agreement, ...args] = process.argv.slice(2);
  const db = new Database();
  try {
    if (action === "bind" && args.length === 4) {
      const [device, account, registration, policy] = args;
      await bindSource(db, agreement, device, {
        account,
        registration,
        policy,
      });
      console.log("Paired device bound to this agreement.");
    } else if (action === "import" && args.length === 1) {
      await importWeek(db, agreement, args[0]);
      console.log("Weekly report ready.");
    } else if (action === "probe" && args.length === 1) {
      console.log(await checkFixture(db, agreement, args[0]));
    } else
      throw new Error(
        "Use bind AGREEMENT DEVICE ACCOUNT REGISTRATION POLICY, probe AGREEMENT FILE, or import AGREEMENT DIRECTORY.",
      );
  } finally {
    await db.pool.end();
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : "Report import failed.");
    process.exitCode = 1;
  });
