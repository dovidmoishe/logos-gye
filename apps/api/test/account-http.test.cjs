const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { eq } = require("drizzle-orm");
const { createApp } = require("../dist/main");
const { Database } = require("../dist/db/connection");
const { accounts, devices } = require("../dist/db/schema");
test("account sessions and one-use scoped device credentials over HTTP", async (t) => {
  const app = await createApp();
  await app.listen(0, "127.0.0.1");
  const db = app.get(Database).db;
  const name = randomUUID().replaceAll("-", "");
  t.after(async () => {
    try {
      await db.delete(accounts).where(eq(accounts.username, name));
      await db.delete(accounts).where(eq(accounts.username, name + "b"));
    } finally {
      await app.close();
    }
  });
  const request = (path, method = "GET", body, headers = {}) =>
    fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const base = (await app.getUrl()) + "/api";
  const login = { username: name, password: randomUUID() };
  assert.equal((await request("/account")).status, 401);
  const registered = await request("/account/register", "POST", login);
  assert.equal(registered.status, 201);
  const cookie = registered.headers.getSetCookie()[0].split(";")[0];
  assert.equal((await request("/account/register", "POST", login)).status, 409);
  assert.equal(
    (
      await request("/account/login", "POST", {
        ...login,
        password: "wrong_password",
      })
    ).status,
    401,
  );
  const other = await request("/account/register", "POST", {
    ...login,
    username: name + "b",
  });
  const cookieB = other.headers.getSetCookie()[0].split(";")[0];
  const scope = "weekly-blocked-counts-v1";
  const invite = await request(
    "/account/agreements",
    "POST",
    { username: name + "b", scope },
    { cookie },
  );
  assert.equal(invite.status, 201);
  const [agreement] = await invite.json();
  const update = (action, c, version) =>
    request(
      "/account/agreements/" + agreement.id,
      "PATCH",
      { action, scope: version },
      { cookie: c },
    );
  assert.equal((await update("accept", cookie, scope)).status, 404);
  assert.equal((await update("accept", cookieB, "different")).status, 400);
  assert.equal(
    (await (await update("accept", cookieB, scope)).json())[0].status,
    "Connected",
  );
  assert.equal(
    (await (await update("revoke", cookie, scope)).json())[0].status,
    "Revoked",
  );
  assert.equal((await update("accept", cookieB, scope)).status, 404);
  const enroll = async () => {
    const r = await request(
      "/account/devices",
      "POST",
      { name: "Test iPhone" },
      { cookie },
    );
    assert.equal(r.status, 201);
    return r.json();
  };
  const expired = await enroll();
  await db
    .update(devices)
    .set({ pairingExpiresAt: 0 })
    .where(eq(devices.id, expired.id));
  assert.equal(
    (await request("/device/pair", "POST", { code: expired.code })).status,
    401,
  );
  const pending = await enroll();
  const attempts = await Promise.all(
    [0, 1].map(() => request("/device/pair", "POST", { code: pending.code })),
  );
  assert.deepEqual(attempts.map((r) => r.status).sort(), [201, 401]);
  const { credential } = await attempts.find((r) => r.ok).json();
  const authorization = "Bearer " + credential;
  assert.equal(
    (await request("/device/checks", "POST", { outcome: "blocked" })).status,
    401,
  );
  assert.equal(
    (
      await request(
        "/device/checks",
        "POST",
        { outcome: "other" },
        { authorization },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/device/checks",
        "POST",
        { outcome: "blocked" },
        { authorization },
      )
    ).status,
    201,
  );
  const live = await (
    await request("/account", "GET", undefined, { cookie })
  ).json();
  assert.equal(
    live.devices.find((d) => d.id === pending.id).lastCheck,
    "blocked",
  );
  assert.equal(JSON.stringify(live).includes(credential), false);
  assert.deepEqual(
    (
      await (
        await request("/account", "GET", undefined, { cookie: cookieB })
      ).json()
    ).devices,
    [],
  );
  assert.equal(
    (
      await request("/account/devices/" + pending.id, "DELETE", undefined, {
        cookie: cookieB,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("/account/devices/" + pending.id, "DELETE", undefined, {
        cookie,
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await request(
        "/device/checks",
        "POST",
        { outcome: "open" },
        { authorization },
      )
    ).status,
    401,
  );
  assert.equal(
    (await request("/account/session", "DELETE", undefined, { cookie })).status,
    204,
  );
  assert.equal(
    (await request("/account", "GET", undefined, { cookie })).status,
    401,
  );
  assert.equal((await request("/account/login", "POST", login)).status, 200);
});
