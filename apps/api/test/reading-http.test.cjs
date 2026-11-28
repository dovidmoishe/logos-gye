const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createServer } = require("node:http");
const { createApp } = require("../dist/main");
const { Database } = require("../dist/db/connection");
const { generateKeyPair, exportJWK, SignJWT } = require("jose");

test("verified Logos identities own their ranked feeds, topics, bookmarks and dashboard sessions", async (t) => {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const key = { ...await exportJWK(publicKey), alg: "ES256", kid: "test-key" };
  const issuerServer = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [key] }));
  });
  await new Promise(resolve => issuerServer.listen(0, "127.0.0.1", resolve));
  const project = "http://127.0.0.1:" + issuerServer.address().port;
  const originalProject = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = project;
  t.after(() => {
    issuerServer.close();
    if (originalProject) process.env.SUPABASE_URL = originalProject;
    else delete process.env.SUPABASE_URL;
  });
  const app = await createApp({logger: false});
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const db = app.get(Database).pool;
  const alice = randomUUID(), bob = randomUUID(), outsider = randomUUID(), translation = randomUUID(), topic = randomUUID(), book = randomUUID();
  t.after(async () => {
    try {
      await db.query("delete from accounts where id=any($1::text[])", [[alice, bob, outsider].map(id => "supabase:" + id)]);
      await db.query("delete from users where id=any($1::uuid[])", [[alice,bob,outsider]]);
      await db.query("delete from bible_translations where id=$1", [translation]);
      await db.query("delete from bible_books where id=$1", [book]);
      await db.query("delete from topics where id=$1", [topic]);
    } finally { await app.close(); }
  });
  await db.query("insert into topics(id,slug,name,description) values($1,$2,'Fixture topic','Fixture')", [topic,topic.slice(0,12)]);
  await db.query("insert into bible_translations(id,code,name,language,license) values($1,$2,'Fixture','en','Fixture')",[translation,translation.slice(0,12)]);
  await db.query("insert into bible_books(id,name,abbreviation,testament,book_order) values($1,'Fixture','F','NEW',999)",[book]);
  const verses = (await db.query("insert into bible_verses(translation_id,book_id,chapter,verse,text,word_count) select $1,$2,1,i,'Fixture',1 from generate_series(1,4) i returning id", [translation,book])).rows.map(v=>v.id);
  await db.query("insert into feed_items(verse_id) select unnest($1::uuid[])",[verses]);
  await db.query("insert into verse_topics(verse_id,topic_id,relevance_score) select unnest($1::uuid[]),$2,1",[verses,topic]);
  const sign = (sub, audience = "authenticated") => new SignJWT({email:sub+"@example.invalid"})
    .setProtectedHeader({alg:"ES256",kid:key.kid}).setIssuer(project+"/auth/v1").setAudience(audience)
    .setSubject(sub).setExpirationTime("5m").sign(privateKey);
  const tokens = await Promise.all([sign(alice),sign(bob)]);
  const call = (path, token, body) => fetch(base+"/api/"+path, {method:body?"POST":"GET",
    headers:{"content-type":"application/json",...(token?{authorization:"Bearer "+token}:{})},
    body:body&&JSON.stringify(body)});
  assert.equal((await call("reading/feed")).status,401);
  assert.equal((await call("reading/feed",await sign(alice,"other"))).status,401);
  // Invite a recipient before their first authenticated API call creates their account.
  const scope = "weekly-blocked-counts-v1";
  const invite = await call("account/agreements", tokens[0], { username: bob.toUpperCase()+"@EXAMPLE.INVALID", scope });
  assert.equal(invite.status, 201);
  const [pending] = await invite.json();
  const path = "account/agreements/" + pending.id;
  const patch = (token, action) => fetch(base+"/api/"+path, { method:"PATCH",
    headers: { "content-type":"application/json", authorization:"Bearer "+token }, body: JSON.stringify({action, scope}) });
  assert.equal((await call(path+"/report", tokens[0])).status, 404);
  assert.equal((await patch(tokens[0], "accept")).status,404);
  assert.equal((await (await call("account/agreements",tokens[1])).json())[0].id,pending.id);
  const unrelated = await sign(outsider);
  assert.deepEqual(await (await call("account/agreements",unrelated)).json(),[]);
  assert.equal((await patch(unrelated, "accept")).status,404);
  assert.equal((await patch(tokens[1], "accept")).status,200);
  assert.equal((await call(path+"/report",unrelated)).status,404);
  assert.equal((await (await call(path+"/report",tokens[1])).json()).status, "awaiting_first_week");
  await db.query("update account_agreements set accepted_at=0 where id=$1",[pending.id]);
  const missing = await (await call(path+"/report",tokens[0])).json();
  assert.equal(missing.status,"unavailable");
  assert.equal(missing.groupedRequests,null);
  // A measured zero requires all seven days, even if no eligible DNS requests arrived.
  const { importWeek, bindSource } = require("../dist/reporting/gateway");
  const { mkdtemp, writeFile, rm } = require("node:fs/promises");
  const { join } = require("node:path");
  const { tmpdir } = require("node:os");
  const directory = await mkdtemp(join(tmpdir(), "logos-zero-"));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const enrollment = await (await call("account/devices",tokens[0],{name:"Zero report fixture"})).json();
  assert.equal((await call("device/pair",undefined,{code:enrollment.code})).status,201);
  const source = {account:"b".repeat(32),registration:randomUUID(),policy:randomUUID()};
  await bindSource(app.get(Database),pending.id,enrollment.id,source);
  await db.query("update agreement_reporting_sources set registered_at=$2 where agreement_id=$1",[pending.id,missing.weekStart]);
  const days = [];
  for (let i=0; i<7; i++) {
    const start = new Date(missing.weekStart + i*86400000).toISOString();
    await writeFile(join(directory,start.slice(0,10)+".ndjson"),"");
    days.push({start,rows:0,completeCoverage:true,sha256:require("node:crypto").createHash("sha256").digest("hex")});
  }
  await writeFile(join(directory,"manifest.json"),JSON.stringify({...source,weekStart:days[0].start,days}));
  assert.equal(await importWeek(app.get(Database),pending.id,directory),0);
  const report = await (await call(path+"/report",tokens[1])).json();
  assert.deepEqual(report,{...missing,status:"available",groupedRequests:0});
  assert.equal((await patch(tokens[0], "revoke")).status,200);
  assert.equal((await call(path+"/report",tokens[1])).status,404);
  const chapter=await (await call("reading/verses/"+verses[2]+"/chapter")).json();
  assert.deepEqual(chapter.verses.map(v=>v.verse),[1,2,3,4]);
  const selected = await call("reading/onboarding/topics", tokens[0], {topicIds: [topic.toUpperCase(), topic]});
  assert.equal(selected.status, 201);
  assert.deepEqual((await selected.json()).topics.map(row => row.id), [topic]);
  const feed=await (await call("reading/feed?limit=2",tokens[0])).json();
  assert.equal(feed.items.length,2);
  assert.ok(feed.items.every(i=>verses.includes(i.verse.verseId)));
  const next=await (await call("reading/feed?limit=2&cursor="+feed.nextCursor,tokens[0])).json();
  assert.ok(next.items.every(i=>!feed.items.some(prev=>prev.feedItemId===i.feedItemId)));
  assert.equal((await call("reading/feed?cursor="+feed.nextCursor,tokens[1])).status,404);
  const event={eventType:"VERSE_SAVE",verseId:verses[0],requestId:randomUUID()};
  const post=()=>call("reading/interactions",tokens[0],event);
  await Promise.all([post(),post()]);
  assert.equal((await db.query("select count(*)::int n from user_events where user_id=$1 and request_id=$2",[alice,event.requestId])).rows[0].n,1);
  const library=async token=>(await call("reading/library",token)).json();
  assert.deepEqual((await library(tokens[0])).saved.map(v=>v.verseId),[verses[0]]);
  assert.deepEqual((await library(tokens[1])).saved,[]);
  await call("reading/interactions",tokens[0],{...event,requestId:randomUUID(),eventType:"VERSE_UNSAVE"});
  assert.deepEqual((await library(tokens[0])).saved,[]);
  const account=await call("account",tokens[0]);
  assert.equal((await account.json()).username,alice+"@example.invalid");
  assert.equal((await call("account", await sign(alice,"other"))).status,401);
});
