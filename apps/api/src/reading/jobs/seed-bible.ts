import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { eq, inArray, sql } from 'drizzle-orm';

import { createDbClient } from './client';
import {
  bibleBooks,
  bibleTranslations,
  bibleVerses,
  feedItems,
} from '../../db/scripture';
import {
  countWords,
  getBookAbbreviation,
  getTestament,
  KjvBible,
  normalizeKjvVerseText,
} from '../offline/kjv';
import { chunk, getScriptOptions } from './lib/script-config';

const KJV_PATH = join(__dirname, '../../../data/kjv.json');
const INSERT_BATCH_SIZE = 500;

const loadKjv = async (): Promise<KjvBible> => {
  const raw = await readFile(KJV_PATH, 'utf8');
  const data = JSON.parse(raw) as KjvBible;

  if (!Array.isArray(data.verses) || data.verses.length === 0) {
    throw new Error('KJV JSON must contain a non-empty verses array');
  }

  return data;
};

const main = async () => {
  const options = getScriptOptions();
  const kjv = await loadKjv();
  const selectedVerses = options.limit
    ? kjv.verses.slice(0, options.limit)
    : kjv.verses;
  const bookSeeds = [
    ...new Map(
      kjv.verses.map((verse) => [
        verse.book,
        {
          abbreviation: getBookAbbreviation(verse.book, verse.book_name),
          bookOrder: verse.book,
          name: verse.book_name,
          testament: getTestament(verse.book),
        },
      ]),
    ).values(),
  ].sort((left, right) => left.bookOrder - right.bookOrder);

  console.log(
    `Preparing KJV seed: ${bookSeeds.length} books, ${selectedVerses.length} verses`,
  );

  if (options.dryRun) {
    console.log({
      first: selectedVerses[0],
      last: selectedVerses[selectedVerses.length - 1],
      translation: {
        language: kjv.metadata.lang_short ?? 'en',
        license: kjv.metadata.copyright_statement,
        name: kjv.metadata.name ?? 'Authorized King James Version',
        shortname: kjv.metadata.shortname ?? 'KJV',
      },
    });
    return;
  }

  const { close, db } = createDbClient();

  try {
    const [translation] = await db
      .insert(bibleTranslations)
      .values({
        code: 'KJV',
        isActive: true,
        language: kjv.metadata.lang_short ?? 'en',
        license:
          kjv.metadata.copyright_statement ??
          'Public Domain in most parts of the world.',
        name: kjv.metadata.name ?? 'Authorized King James Version',
      })
      .onConflictDoUpdate({
        target: bibleTranslations.code,
        set: {
          isActive: true,
          language: sql`excluded.language`,
          license: sql`excluded.license`,
          name: sql`excluded.name`,
        },
      })
      .returning();

    const existingBooks = await db.select().from(bibleBooks);
    const booksByOrder = new Map(
      existingBooks.map((book) => [book.bookOrder, book]),
    );

    for (const bookSeed of bookSeeds) {
      const existingBook = booksByOrder.get(bookSeed.bookOrder);

      if (existingBook) {
        const [updatedBook] = await db
          .update(bibleBooks)
          .set({
            abbreviation: bookSeed.abbreviation,
            name: bookSeed.name,
            testament: bookSeed.testament,
          })
          .where(eq(bibleBooks.id, existingBook.id))
          .returning();

        booksByOrder.set(bookSeed.bookOrder, updatedBook);
        continue;
      }

      const [createdBook] = await db
        .insert(bibleBooks)
        .values(bookSeed)
        .returning();

      booksByOrder.set(bookSeed.bookOrder, createdBook);
    }

    let processed = 0;

    for (const verseBatch of chunk(selectedVerses, INSERT_BATCH_SIZE)) {
      const insertedVerses = await db
        .insert(bibleVerses)
        .values(
          verseBatch.map((verse) => {
            const text = normalizeKjvVerseText(verse.text);
            const book = booksByOrder.get(verse.book);

            if (!book) {
              throw new Error(`Book ${verse.book} was not seeded`);
            }

            return {
              bookId: book.id,
              chapter: verse.chapter,
              text,
              translationId: translation.id,
              verse: verse.verse,
              wordCount: countWords(text),
            };
          }),
        )
        .onConflictDoUpdate({
          target: [
            bibleVerses.translationId,
            bibleVerses.bookId,
            bibleVerses.chapter,
            bibleVerses.verse,
          ],
          set: {
            text: sql`excluded.text`,
            wordCount: sql`excluded.word_count`,
          },
        })
        .returning({ id: bibleVerses.id });

      if (insertedVerses.length > 0) {
        await db
          .insert(feedItems)
          .values(insertedVerses.map((verse) => ({ verseId: verse.id })))
          .onConflictDoNothing();
      }

      processed += verseBatch.length;
      console.log(`Seeded ${processed}/${selectedVerses.length} verses`);
    }

    const verseIds = await db
      .select({ id: bibleVerses.id })
      .from(bibleVerses)
      .where(eq(bibleVerses.translationId, translation.id));

    if (verseIds.length > 0) {
      for (const verseIdBatch of chunk(verseIds, INSERT_BATCH_SIZE)) {
        await db
          .insert(feedItems)
          .values(verseIdBatch.map((verse) => ({ verseId: verse.id })))
          .onConflictDoNothing();
      }
    }

    console.log(`KJV seed complete: ${processed} verses processed`);
  } finally {
    await close();
  }
};

void main().catch((error) => {
  console.error('Bible seed failed');
  console.error(error);
  process.exit(1);
});
