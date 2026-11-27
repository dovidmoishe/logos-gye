import { isNull, sql } from 'drizzle-orm';

import { createDbClient } from './client';
import { topics } from '../../db/scripture';
import { OpenAiEmbeddingProvider } from '../embeddings/openai-embedding.provider';
import { toPgVectorLiteral } from '../offline/scoring';
import { chunk, getScriptOptions, withRetry } from './lib/script-config';



const main = async () => {
  const options = getScriptOptions();
  const { close, db } = createDbClient();

  try {
    const query = options.force
      ? db.select().from(topics)
      : db.select().from(topics).where(isNull(topics.embedding));
    const rows = options.limit ? (await query).slice(0, options.limit) : await query;

    console.log(`Preparing to embed ${rows.length} topics`);

    if (options.dryRun || rows.length === 0) {
      return;
    }

    const provider = new OpenAiEmbeddingProvider();
    let processed = 0;

    for (const batch of chunk(rows, options.batchSize)) {
      const embeddings = await withRetry(
        () =>
          provider.embedBatch(
            batch.map((topic) => `${topic.name}. ${topic.description}`),
          ),
        options.maxRetries,
      );

      for (let index = 0; index < batch.length; index += 1) {
        await db.execute(sql`
          update ${topics}
          set embedding = ${toPgVectorLiteral(embeddings[index])}::vector
          where id = ${batch[index].id}
        `);
      }

      processed += batch.length;
      console.log(`Embedded ${processed}/${rows.length} topics`);
    }
  } finally {
    await close();
  }
};

void main().catch((error) => {
  console.error('Topic embedding generation failed');
  console.error(error);
  process.exit(1);
});
