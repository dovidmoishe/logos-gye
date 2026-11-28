const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createServer } = require("node:http");
const dns = require("dns-packet");
const { createApp } = require("../dist/main");
const { Database } = require("../dist/db/connection");
const { AccountService } = require("../dist/accounts");
const { Agreements } = require("../dist/agreements");
const { deviceResolver } = require("../dist/reporting/adguard");
const { reportScope } = require("../dist/reporting/week");

test("device DNS returns real wire answers and only adult-list blocks enter the partner report", async (t) => {
  const fixture = "nudity.testcategory.com";
  const adult = process.env.ADGUARD_TEST_BLOCKED_HOST || "blocked.example.test";
  const upstream = createServer(async (req, res) => {
    if (req.url === "/control/filtering/status") {
      return res.end(
        JSON.stringify({
          enabled: true,
          filters: [{ id: 1001, enabled: true, rules_count: 1 }],
        }),
      );
    }
    if (req.url.startsWith("/control/filtering/check_host?")) {
      const host = new URL(req.url, "http://local").searchParams.get("name");
      return res.end(
        JSON.stringify({
          reason: "FilteredBlackList",
          rules: [{ filter_list_id: host === adult ? 1001 : 22 }],
        }),
      );
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const query = dns.decode(Buffer.concat(chunks));
    const [q] = query.questions;
    res.setHeader("content-type", "application/dns-message");
    res.end(
      dns.encode({
        id: query.id,
        type: "response",
        questions: [q],
        answers: [
          {
            ...q,
            ttl: 10,
            data:
              q.name === "example.com"
                ? "93.184.216.34"
                : q.type === "AAAA"
                  ? "::"
                  : "0.0.0.0",
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  t.after(() => upstream.close());
  process.env.ADGUARD_INTERNAL_ORIGIN =
    process.env.ADGUARD_TEST_ORIGIN ||
    "http://127.0.0.1:" + upstream.address().port;
  process.env.ADGUARD_PUBLIC_ORIGIN = "https://dns.example.test";
  process.env.ADGUARD_DEVICE_SECRET = randomUUID();
  const app = await createApp({ logger: false });
  await app.listen(0, "127.0.0.1");
  const db = app.get(Database),
    service = app.get(AccountService),
    agreements = app.get(Agreements);
  const owner = { id: randomUUID(), username: randomUUID() + "@example.test" };
  const partner = {
    id: randomUUID(),
    username: randomUUID() + "@example.test",
  };
  t.after(async () => {
    await db.pool.query("delete from accounts where id=any($1)", [
      [owner.id, partner.id],
    ]);
    await app.close();
  });
  for (const u of [owner, partner])
    await db.pool.query(
      "insert into accounts(id,username,password_hash) values($1,$2,'fixture')",
      [u.id, u.username],
    );
  const device = await service.connectInstallation(
    owner.id,
    randomUUID(),
    true,
    null,
  );
  const url =
    (await app.getUrl()) + new URL(deviceResolver(device.id)).pathname;
  const send = (name, type = "A", method = "POST") => {
    const wire = dns.encode({
      type: "query",
      flags: dns.RECURSION_DESIRED,
      questions: [{ name, type }],
    });
    return method === "GET"
      ? fetch(url + "?dns=" + wire.toString("base64url"))
      : fetch(url, {
          method,
          headers: { "content-type": "application/dns-message" },
          body: wire,
        });
  };
  const [agreement] = await agreements.invite(
    owner,
    partner.username,
    reportScope,
  );
  await agreements.respond(partner, agreement.id, "accept", reportScope);
  await agreements.setAlerts(owner, agreement.id, true);
  await agreements.setAlerts(partner, agreement.id, true);
  const answer = async (name, type, method) => {
    const r = await send(name, type, method);
    assert.equal(r.status, 200);
    return dns
      .decode(Buffer.from(await r.arrayBuffer()))
      .answers.map((a) => a.data);
  };
  assert.equal((await fetch(url + "bad")).status, 403);
  assert.deepEqual(await answer(fixture), ["0.0.0.0"]);
  const allowed = await answer("example.com", "A", "GET");
  assert.ok(allowed.length && !allowed.includes("0.0.0.0"));
  if (!process.env.ADGUARD_TEST_ORIGIN)
    await answer("malware-only.example.test");
  assert.deepEqual(await answer(adult), ["0.0.0.0"]);
  assert.deepEqual(await answer(adult, "AAAA", "GET"), ["::"]);
  const recorded = () =>
    db.pool.query(
      "select count(*)::int as n from agreement_live_blocks where agreement_id=$1",
      [agreement.id],
    );
  for (let i = 0; i < 80 && (await recorded()).rows[0].n < 2; i++)
    await new Promise((r) => setTimeout(r, 25));
  assert.equal((await recorded()).rows[0].n, 2);
  assert.deepEqual(await agreements.liveReport(partner, agreement.id), {
    status: "observed",
    groupedRequests: 1,
  });
  if (process.env.ADGUARD_TEST_MAILPIT) {
    const mail = new URL("/api/v1/search", process.env.ADGUARD_TEST_MAILPIT);
    mail.searchParams.set(
      "query",
      "to:" + partner.username + ' subject:"Could you check in?"',
    );
    let received = 0;
    for (let i = 0; i < 32 && !received; i++) {
      received = (await (await fetch(mail)).json()).messages.length;
      if (!received) await new Promise((r) => setTimeout(r, 250));
    }
    assert.equal(received, 1);
  } else {
    const jobs = await db.pool.query(
      "select count(*)::int as n from partner_mail where agreement_id=$1 and kind='check-in'",
      [agreement.id],
    );
    assert.equal(jobs.rows[0].n, 1);
  }
  await service.remove(owner.id, device.id);
  assert.equal((await send(adult)).status, 403);
});
