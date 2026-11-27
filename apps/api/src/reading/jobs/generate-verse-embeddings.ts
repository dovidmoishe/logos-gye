import { and, asc, gt, isNull, sql, type SQL } from 'drizzle-orm';

import { createDbClient } from './client';
import { bibleVerses } from '../../db/scripture';
import { OpenAiEmbeddingProvider } from '../embeddings/openai-embedding.provider';
import { toPgVectorLiteral } from '../offline/scoring';
import {
  getScriptOptions,
  iteratePages,
  withRetry,
} from './lib/script-config';



const main = async () => {
  const options = getScriptOptions();
  const { close, db } = createDbClient();

  try {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bibleVerses)
      .where(options.force ? undefined : isNull(bibleVerses.embedding));
    const totalAvailable = Number(countRow?.count ?? 0);
    const total = options.limit
      ? Math.min(options.limit, totalAvailable)
      : totalAvailable;

    console.log(`Preparing to embed ${total} verses`);

    if (options.dryRun || total === 0) {
      return;
    }

    const provider = new OpenAiEmbeddingProvider();
    let processed = 0;

    for await (const batch of iteratePages(
      async ({ cursor, limit }) => {
        const filters: SQL[] = [];

        if (!options.force) {
          filters.push(isNull(bibleVerses.embedding));
        }

        if (cursor) {
          filters.push(gt(bibleVerses.id, cursor));
        }

        return db
          .select({
            id: bibleVerses.id,
            text: bibleVerses.text,
          })
          .from(bibleVerses)
          .where(filters.length > 0 ? and(...filters) : undefined)
          .orderBy(asc(bibleVerses.id))
          .limit(limit);
      },
      { limit: options.limit, pageSize: options.batchSize },
    )) {
      const embeddings = await withRetry(
        () => provider.embedBatch(batch.map((verse) => verse.text)),
        options.maxRetries,
      );

      for (let index = 0; index < batch.length; index += 1) {
        await db.execute(sql`
          update ${bibleVerses}
          set embedding = ${toPgVectorLiteral(embeddings[index])}::vector
          where id = ${batch[index].id}
        `);
      }

      processed += batch.length;
      console.log(`Embedded ${processed}/${total} verses`);
    }
  } finally {
    await close();
  }
};

void main().catch((error) => {
  console.error('Verse embedding generation failed');
  console.error(error);
  process.exit(1);
});
