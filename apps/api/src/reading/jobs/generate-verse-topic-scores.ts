import { and, asc, gt, isNotNull, sql, type SQL } from 'drizzle-orm';

import { createDbClient } from './client';
import {
  bibleBooks,
  bibleVerses,
  topics,
  verseTopics,
} from '../../db/scripture';
import {
  getScriptOptions,
  getTopicScoreOptions,
  iteratePages,
} from './lib/script-config';

const main = async () => {
  const options = getScriptOptions();
  const scoreOptions = getTopicScoreOptions();
  const { close, db } = createDbClient();

  try {
    const [topicCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(topics)
      .where(isNotNull(topics.embedding));
    const topicCount = Number(topicCountRow?.count ?? 0);

    if (topicCount === 0) {
      throw new Error('No topic embeddings found. Run embed:topics first.');
    }

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bibleVerses)
      .innerJoin(bibleBooks, sql`${bibleVerses.bookId} = ${bibleBooks.id}`)
      .where(isNotNull(bibleVerses.embedding));
    const totalAvailable = Number(countRow?.count ?? 0);
    const total = options.limit
      ? Math.min(options.limit, totalAvailable)
      : totalAvailable;

    console.log(
      `Preparing topic scores for ${total} verses against ${topicCount} topics (min similarity ${scoreOptions.minTopicSimilarity}, max ${scoreOptions.maxTopicsPerVerse} per verse)`,
    );

    if (options.dryRun || total === 0) {
      return;
    }

    if (options.force) {
      await db.delete(verseTopics);
      console.log('Cleared existing verse-topic scores');
    }

    let processed = 0;
    const sampleVerseIds: string[] = [];

    for await (const verseBatch of iteratePages(
      async ({ cursor, limit }) => {
        const filters: SQL[] = [isNotNull(bibleVerses.embedding)];

        if (cursor) {
          filters.push(gt(bibleVerses.id, cursor));
        }

        return db
          .select({
            id: bibleVerses.id,
          })
          .from(bibleVerses)
          .innerJoin(bibleBooks, sql`${bibleVerses.bookId} = ${bibleBooks.id}`)
          .where(and(...filters))
          .orderBy(asc(bibleVerses.id))
          .limit(limit);
      },
      { limit: options.limit, pageSize: options.batchSize },
    )) {
      const verseIds = verseBatch.map((verse) => verse.id);
      const idList = sql.join(
        verseIds.map((id) => sql`${id}`),
        sql`, `,
      );

      await db.execute(sql`
        insert into ${verseTopics} (verse_id, topic_id, relevance_score)
        select s.verse_id, s.topic_id, s.score
        from (
          select
            ${bibleVerses.id} as verse_id,
            ${topics.id} as topic_id,
            (1 - (${bibleVerses.embedding} <=> ${topics.embedding}))::real as score,
            row_number() over (
              partition by ${bibleVerses.id}
              order by ${bibleVerses.embedding} <=> ${topics.embedding}
            ) as rn
          from ${bibleVerses}
          cross join ${topics}
          where ${bibleVerses.id} in (${idList})
            and ${bibleVerses.embedding} is not null
            and ${topics.embedding} is not null
        ) s
        where s.score >= ${scoreOptions.minTopicSimilarity}
          and s.rn <= ${scoreOptions.maxTopicsPerVerse}
        on conflict (verse_id, topic_id)
        do update set relevance_score = excluded.relevance_score
      `);

      if (sampleVerseIds.length < 5) {
        sampleVerseIds.push(
          ...verseIds.slice(0, 5 - sampleVerseIds.length),
        );
      }

      processed += verseBatch.length;
      console.log(`Scored ${processed}/${total} verses`);
    }

    const [written] = await db
      .select({
        rows: sql<number>`count(*)::int`,
        verses: sql<number>`count(distinct ${verseTopics.verseId})::int`,
      })
      .from(verseTopics);
    console.log(
      `Wrote ${Number(written?.rows ?? 0)} verse-topic rows across ${Number(written?.verses ?? 0)} verses`,
    );

    const sampleIdList = sql.join(
      sampleVerseIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const samples = sampleVerseIds.length
      ? await db.execute(sql`
          select
            ${bibleBooks.name} as book_name,
            ${bibleVerses.chapter} as chapter,
            ${bibleVerses.verse} as verse,
            coalesce(
              string_agg(
                ${topics.name} || ' ' || round(${verseTopics.relevanceScore}::numeric, 3),
                ', ' order by ${verseTopics.relevanceScore} desc
              ),
              ''
            ) as topic_names
          from ${bibleVerses}
          inner join ${bibleBooks} on ${bibleVerses.bookId} = ${bibleBooks.id}
          left join ${verseTopics} on ${verseTopics.verseId} = ${bibleVerses.id}
          left join ${topics} on ${topics.id} = ${verseTopics.topicId}
          where ${bibleVerses.id} in (${sampleIdList})
          group by ${bibleBooks.name}, ${bibleVerses.chapter}, ${bibleVerses.verse}, ${bibleVerses.id}
          order by ${bibleVerses.id}
        `)
      : [];

    const philippians = await db.execute(sql`
      select
        ${topics.name} as name,
        round(${verseTopics.relevanceScore}::numeric, 3) as score
      from ${bibleVerses}
      inner join ${bibleBooks} on ${bibleVerses.bookId} = ${bibleBooks.id}
      inner join ${verseTopics} on ${verseTopics.verseId} = ${bibleVerses.id}
      inner join ${topics} on ${topics.id} = ${verseTopics.topicId}
      where ${bibleBooks.name} = ${'Philippians'}
        and ${bibleVerses.chapter} = ${4}
        and ${bibleVerses.verse} = ${6}
      order by ${verseTopics.relevanceScore} desc
    `);

    console.log('Sample classifications:');
    for (const sample of samples as Array<{
      book_name: string;
      chapter: number;
      verse: number;
      topic_names: string;
    }>) {
      console.log(
        `- ${sample.book_name} ${sample.chapter}:${sample.verse} - ${sample.topic_names}`,
      );
    }

    if (Array.isArray(philippians) && philippians.length > 0) {
      const topicNames = philippians
        .map((row) => `${row.name} ${row.score}`)
        .join(', ');
      console.log(`- Philippians 4:6 - ${topicNames}`);
    }
  } finally {
    await close();
  }
};

void main().catch((error) => {
  console.error('Verse-topic scoring failed');
  console.error(error);
  process.exit(1);
});
