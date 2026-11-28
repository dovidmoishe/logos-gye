const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createApp } = require("../dist/main");
const { Database } = require("../dist/db/connection");

test("email sign-in delivers through Senviok and issues revocable web and phone sessions", async (t) => {
  const email = randomUUID() + "@example.test";
  const subject = randomUUID();
  const app = await createApp({ logger: false });
  await app.listen(0, "127.0.0.1");
  const pool = app.get(Database).pool;
  const origin = await app.getUrl();
  process.env.PARTNER_MAIL_FROM = "sender@example.test";
  process.env.SENVIOK_API_KEY = "test-only";

  const fetchAPI = global.fetch;
  let code;
  t.mock.method(global, "fetch", async (url, options) => {
    if (String(url) !== "https://api.senviok.live/v1/emails")
      return fetchAPI(url, options);
    const message = JSON.parse(options.body);
    assert.equal(message.to, email);
    assert.equal(
      new Headers(options.headers).get("authorization"),
      "Bearer test-only",
    );
    code = message.text.match(/\b\d{8}\b/)[0];
    assert.match(message.html, new RegExp(`>${code}<`));
    assert.match(message.html, /expires in 10 minutes/);
    return Response.json({ id: "test-receipt" });
  });
  t.after(async () => {
    try {
      await pool.query("delete from accounts where id=$1", [
        "supabase:" + subject,
      ]);
      await pool.query("delete from users where id=$1", [subject]);
      await pool.query("delete from login_challenges where email=$1", [email]);
    } finally {
      await app.close();
    }
  });
  await pool.query("insert into users(id,email) values($1,$2)", [
    subject,
    email,
  ]);
  const post = (path, data, headers = {}) =>
    fetchAPI(origin + "/api/auth/" + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(data),
    });
  const request = async () => {
    const r = await post("otp", { email: email.toUpperCase() });
    assert.equal(r.status, 200);
    return (await r.json()).challenge;
  };
  let challenge = await request();
  assert.equal((await post("otp", { email })).status, 429);
  const verify = (token, client) =>
    post("verify", { email, challenge, token, client });
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await verify(code === "00000000" ? "00000001" : "00000000")).status,
      401,
    );
  assert.equal((await verify(code)).status, 401);
  const resend = async () => {
    await pool.query("update login_challenges set sent_at=0 where email=$1", [
      email,
    ]);
    challenge = await request();
  };
  await resend();
  const results = await Promise.all([verify(code), verify(code)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
  const mobile = await results.find((r) => r.ok).json();
  assert.equal(mobile.user.id, subject);
  const headers = { authorization: "Bearer " + mobile.access_token };
  const me = () => fetchAPI(origin + "/api/reading/users/me", { headers });
  assert.equal((await me()).status, 200);
  assert.equal((await post("logout", {}, headers)).status, 204);
  assert.equal((await me()).status, 401);
  await resend();
  const browser = await verify(code, "web");
  assert.equal(browser.status, 200);
  assert.equal((await browser.json()).access_token, undefined);
  const cookie = browser.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  const webHeaders = { cookie: cookie.split(";")[0] };
  const account = () =>
    fetchAPI(origin + "/api/account", { headers: webHeaders });
  assert.equal((await (await account()).json()).username, email);
  await fetchAPI(origin + "/api/account/session", {
    method: "DELETE",
    headers: webHeaders,
  });
  assert.equal((await account()).status, 401);
  await resend();
  await pool.query("update login_challenges set sent_at=0 where email=$1", [
    email,
  ]);
  assert.equal((await verify(code)).status, 401);
});
