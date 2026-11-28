const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const { mkdtemp, writeFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createApp } = require("../dist/main");
const { Database } = require("../dist/db/connection");
const {
  bindSource,
  checkFixture,
  importWeek,
} = require("../dist/reporting/gateway");
const { day, week, monday, reportScope } = require("../dist/reporting/week");

test("only a complete consented export publishes once and both parties can read it", async (t) => {
  const app = await createApp({ logger: false });
  await app.listen(0, "127.0.0.1");
  const db = app.get(Database);
  const base = await app.getUrl();
  const directory = await mkdtemp(join(tmpdir(), "logos-week-"));
  const names = [];
  t.after(async () => {
    try {
      await db.pool.query("delete from accounts where username=any($1)", [
        names,
      ]);
      await rm(directory, { recursive: true, force: true });
    } finally {
      await app.close();
    }
  });
  const request = (path, cookie, method = "GET", data) =>
    fetch(base + "/api/" + path, {
      method,
      headers: { "content-type": "application/json", cookie },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  async function register() {
    const username = randomUUID().replaceAll("-", "");
    names.push(username);
    const res = await request("account/register", "", "POST", {
      username,
      password: randomUUID(),
    });
    assert.equal(res.status, 201);
    return { username, cookie: res.headers.getSetCookie()[0].split(";")[0] };
  }
  const owner = await register(),
    partner = await register(),
    outsider = await register();
  const enroll = await request("account/devices", owner.cookie, "POST", {
    name: "Fixture iPhone",
  });
  const device = await enroll.json();
  const source = {
    account: "a".repeat(32),
    registration: randomUUID(),
    policy: randomUUID(),
  };
  const path = "account/agreements";
  const invite = await request(path, owner.cookie, "POST", {
    username: partner.username,
    scope: reportScope,
  });
  const [agreement] = await invite.json();
  const agreementPath = path + "/" + agreement.id;
  const report = (cookie) => request(agreementPath + "/report", cookie);
  await assert.rejects(bindSource(db, agreement.id, device.id, source));
  await request(agreementPath, partner.cookie, "PATCH", {
    action: "accept",
    scope: reportScope,
  });
  await assert.rejects(bindSource(db, agreement.id, device.id, source));
  assert.equal(
    (await request("device/pair", "", "POST", { code: device.code })).status,
    201,
  );
  await bindSource(db, agreement.id, device.id, source);
  const start = monday(Date.now()) - week;
  const iso = (time) => new Date(time).toISOString();
  const row = (time, name) => ({
    AccountID: source.account,
    RegistrationID: source.registration,
    PolicyID: source.policy,
    ResolverDecision: "blockedByCategory",
    Datetime: iso(time),
    QueryName: name,
  });
  const fixture = "nudity.testcategory.com";
  const manifest = { ...source, weekStart: iso(start), days: [] };
  async function writeDay(i, rows) {
    const data = rows.map((row) => JSON.stringify(row)).join("\n");
    const from = start + i * day;
    await writeFile(join(directory, iso(from).slice(0, 10) + ".ndjson"), data);
    manifest.days[i] = {
      start: iso(from),
      completeCoverage: true,
      rows: rows.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  }
  for (let i = 0; i < 7; i++) await writeDay(i, []);
  await assert.rejects(importWeek(db, agreement.id, directory), /entire week/);
  // Only synthetic accounts in this test are advanced across the consent boundary.
  await db.pool.query(
    "update account_agreements set accepted_at=$2 where id=$1",
    [agreement.id, start],
  );
  await db.pool.query(
    "update agreement_reporting_sources set registered_at=$2 where agreement_id=$1",
    [agreement.id, start],
  );
  const probe = join(directory, "probe.ndjson");
  await writeFile(
    probe,
    [row(start, fixture), row(start + 9, fixture)]
      .map((r) => JSON.stringify(r))
      .join("\n"),
  );
  assert.deepEqual(await checkFixture(db, agreement.id, probe), {
    requests: 2,
    groups: 1,
  });
  const wrong = { ...row(start, fixture), RegistrationID: randomUUID() };
  await writeDay(0, [wrong]);
  await assert.rejects(importWeek(db, agreement.id, directory), /outside/);
  await writeDay(0, [
    row(start + day - 50, "retry.example.test"),
    row(start, fixture),
  ]);
  await writeDay(1, [
    row(start + day + 400000, "retry.example.test"),
    row(start + day + 1, "RETRY.EXAMPLE.TEST."),
  ]);
  manifest.days[6].completeCoverage = false;
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  await assert.rejects(importWeek(db, agreement.id, directory), /coverage/);
  assert.equal(
    (await (await report(owner.cookie)).json()).groupedRequests,
    null,
  );
  await writeDay(6, []);
  assert.deepEqual(
    await Promise.all([
      importWeek(db, agreement.id, directory),
      importWeek(db, agreement.id, directory),
    ]),
    [2, 2],
  );
  for (const actor of [owner, partner])
    assert.deepEqual(await (await report(actor.cookie)).json(), {
      status: "available",
      weekStart: start,
      weekEnd: start + week,
      groupedRequests: 2,
    });
  assert.equal((await report(outsider.cookie)).status, 404);
  const jobs = await db.pool.query(
    "select period from partner_mail where agreement_id=$1",
    [agreement.id],
  );
  assert.equal(jobs.rows.length, 1);
  await writeDay(1, []);
  await assert.rejects(importWeek(db, agreement.id, directory), /conflicts/);
  await request(agreementPath, partner.cookie, "PATCH", { action: "revoke" });
  assert.equal((await report(owner.cookie)).status, 404);
  const retained = await db.pool.query(`
    select 1 from partner_mail where agreement_id=$1
    union all select 1 from agreement_reporting_sources where agreement_id=$1
    union all select 1 from agreement_weekly_reports where agreement_id=$1`, [agreement.id]);
  assert.equal(retained.rowCount, 0);
  await assert.rejects(importWeek(db, agreement.id, directory));
});
