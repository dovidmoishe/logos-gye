const { test } = require("node:test");
const assert = require("node:assert/strict");
const { gzipSync } = require("node:zlib");
const { randomUUID } = require("node:crypto");
const { createApp } = require("../dist/main");
const { Database } = require("../dist/db/connection");
const { AccountService } = require("../dist/accounts");
const { Agreements } = require("../dist/agreements");
const { bindSource } = require("../dist/reporting/gateway");
const { reportScope } = require("../dist/reporting/week");

test("automatic device ownership, mutual support alerts and grouped live counts", async (t) => {
  const secret = randomUUID();
  process.env.PARTNER_GATEWAY_SECRET = secret;
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
    delete process.env.PARTNER_GATEWAY_SECRET;
    await app.close();
  });
  for (const user of [owner, partner])
    await db.pool.query(
      "insert into accounts(id,username,password_hash) values($1,$2,'fixture')",
      [user.id, user.username],
    );
  const installation = randomUUID();
  const old = await service.enroll(owner.id, "My phone");
  const { credential } = await service.pair(old.code);
  const connections = await Promise.all(
    [1, 2].map(() =>
      service.connectInstallation(owner.id, installation, true, credential),
    ),
  );
  assert.deepEqual(connections, [{ id: old.id }, { id: old.id }]);
  await assert.rejects(
    service.checkInstallation(partner.id, installation, "blocked"),
  );
  await service.checkInstallation(owner.id, installation, "blocked");
  const otherPhone = await service.connectInstallation(
    partner.id,
    installation,
    true,
    credential,
  );
  assert.notEqual(otherPhone.id, old.id);
  await service.remove(partner.id, otherPhone.id);
  await assert.rejects(
    service.connectInstallation(partner.id, installation, false, null),
  );
  const [agreement] = await agreements.invite(
    owner,
    partner.username,
    reportScope,
  );
  await agreements.respond(partner, agreement.id, "accept", reportScope);
  const source = {
    account: "a".repeat(32),
    registration: randomUUID(),
    policy: randomUUID(),
  };
  await bindSource(db, agreement.id, old.id, source);
  const endpoint = (await app.getUrl()) + "/api/reporting/gateway";
  const row = (domain = "blocked.example.test", mod = {}) => ({
    AccountID: source.account,
    RegistrationID: source.registration,
    PolicyID: source.policy,
    ResolverDecision: "blockedByCategory",
    QueryName: domain,
    Datetime: new Date().toISOString(),
    ...mod,
  });
  const send = (rows, key = secret) =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        authorization: "Bearer " + key,
      },
      body: gzipSync(rows.map((r) => JSON.stringify(r)).join("\n")),
    });
  const activity = () => agreements.liveReport(partner, agreement.id);
  const jobs = async () =>
    (
      await db.pool.query(
        "select count(*)::int as n from partner_mail where agreement_id=$1 and kind='check-in'",
        [agreement.id],
      )
    ).rows[0].n;
  await agreements.setAlerts(owner, agreement.id, true);
  assert.equal((await send([row("before-consent.example.test")])).status, 204);
  assert.equal(
    (await agreements.liveReport(owner, agreement.id)).groupedRequests,
    1,
  );
  assert.equal((await activity()).status, "off");
  await agreements.setAlerts(partner, agreement.id, true);
  assert.equal((await send([row()], "wrong")).status, 401);
  await send([
    row("nudity.testcategory.com."),
    row("other.test", { RegistrationID: randomUUID() }),
    row("allowed.test", { ResolverDecision: "allowedRule" }),
  ]);
  assert.deepEqual(await activity(), {
    status: "awaiting_events",
    groupedRequests: null,
  });
  const event = row();
  await Promise.all([send([event]), send([event])]);
  await send([row("BLOCKED.EXAMPLE.TEST."), row("different.example.test")]);
  assert.deepEqual(await activity(), {
    status: "observed",
    groupedRequests: 2,
  });
  assert.equal(await jobs(), 1);
  await agreements.setAlerts(owner, agreement.id, false);
  assert.equal(await jobs(), 0);
  await agreements.setAlerts(owner, agreement.id, true);
  await send([event]);
  assert.deepEqual(await activity(), {
    status: "awaiting_events",
    groupedRequests: null,
  });
  await agreements.respond(partner, agreement.id, "revoke");
  await send([row()]);
  assert.equal(await jobs(), 0);
  await assert.rejects(activity());
});
