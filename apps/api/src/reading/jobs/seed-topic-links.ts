import { sql } from "drizzle-orm";
import { createDbClient } from "./client";

async function seed() {
  const { db, close } = createDbClient();
  try {
    await db.execute(sql`
      insert into verse_topics (verse_id, topic_id, relevance_score)
      select v.id, t.id, 0.6
      from topics t join bible_verses v
        on to_tsvector('english', v.text) @@ plainto_tsquery('english', t.name)
      on conflict (verse_id, topic_id) do nothing
    `);
  } finally { await close(); }
}
seed().catch(error => { console.error(error); process.exitCode = 1; });
