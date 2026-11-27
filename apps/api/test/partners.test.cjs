const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { eq } = require("drizzle-orm");
const { Database } = require("../dist/db/connection");
const { partners } = require("../dist/db/schema");
const { Partners } = require("../dist/partners");
test("postgres demo agreements handle races, expiry and workspace isolation", async (t) => {
  const database = new Database();
  const a = randomUUID(),
    b = randomUUID();
  const service = new Partners(database);
  await database.onModuleInit();
  t.after(async () => {
    try {
      await service.clear(a);
      await service.clear(b);
    } finally {
      await database.onApplicationShutdown();
    }
  });
  const invites = await Promise.allSettled([
    service.invite(a, " Example@example.com "),
    service.invite(a, "example@example.com"),
  ]);
  assert.equal(invites.filter((i) => i.status === "fulfilled").length, 1);
  assert.equal(
    invites.find((i) => i.status === "rejected").reason.getStatus(),
    409,
  );
  const [p] = await service.list(a);
  assert.equal(p.email, "example@example.com");
  assert.deepEqual(await service.list(b), []);
  await assert.rejects(
    service.change(b, p.id, "accept"),
    (e) => e.getStatus() === 404,
  );
  assert.equal(
    (await service.change(a, p.id, "accept"))[0].status,
    "Connected",
  );
  assert.equal((await service.change(a, p.id, "revoke"))[0].status, "Revoked");
  await assert.rejects(
    service.change(a, p.id, "accept"),
    (e) => e.getStatus() === 409,
  );
  const [pending] = await service.invite(a, p.email);
  await database.db
    .update(partners)
    .set({ expiresAt: Date.now() - 1000 })
    .where(eq(partners.id, pending.id));
  await assert.rejects(
    service.change(a, pending.id, "accept"),
    (e) => e.getStatus() === 409,
  );
  const reordered = await service.invite(a, p.email);
  assert.deepEqual(
    reordered.map((p) => p.status),
    ["Pending", "Expired", "Revoked"],
  );
});
