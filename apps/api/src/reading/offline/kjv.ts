export type KjvVerse = {
  book_name: string;
  book: number;
  chapter: number;
  verse: number;
  text: string;
};

export type KjvBible = {
  metadata: {
    name?: string;
    shortname?: string;
    lang_short?: string;
    copyright_statement?: string;
  };
  verses: KjvVerse[];
};

export const normalizeKjvVerseText = (text: string): string =>
  text
    .replace(/¶/g, '')
    .replace(/[‹›]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const countWords = (text: string): number => {
  const words = text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g);

  return words?.length ?? 0;
};

export const getTestament = (bookOrder: number): 'OLD' | 'NEW' => {
  if (bookOrder >= 1 && bookOrder <= 39) {
    return 'OLD';
  }

  if (bookOrder >= 40 && bookOrder <= 66) {
    return 'NEW';
  }

  throw new Error(`Unsupported Bible book order: ${bookOrder}`);
};

const BOOK_ABBREVIATIONS = new Map<number, string>([
  [1, 'Gen'],
  [2, 'Exod'],
  [3, 'Lev'],
  [4, 'Num'],
  [5, 'Deut'],
  [6, 'Josh'],
  [7, 'Judg'],
  [8, 'Ruth'],
  [9, '1 Sam'],
  [10, '2 Sam'],
  [11, '1 Kgs'],
  [12, '2 Kgs'],
  [13, '1 Chr'],
  [14, '2 Chr'],
  [15, 'Ezra'],
  [16, 'Neh'],
  [17, 'Esth'],
  [18, 'Job'],
  [19, 'Ps'],
  [20, 'Prov'],
  [21, 'Eccl'],
  [22, 'Song'],
  [23, 'Isa'],
  [24, 'Jer'],
  [25, 'Lam'],
  [26, 'Ezek'],
  [27, 'Dan'],
  [28, 'Hos'],
  [29, 'Joel'],
  [30, 'Amos'],
  [31, 'Obad'],
  [32, 'Jonah'],
  [33, 'Mic'],
  [34, 'Nah'],
  [35, 'Hab'],
  [36, 'Zeph'],
  [37, 'Hag'],
  [38, 'Zech'],
  [39, 'Mal'],
  [40, 'Matt'],
  [41, 'Mark'],
  [42, 'Luke'],
  [43, 'John'],
  [44, 'Acts'],
  [45, 'Rom'],
  [46, '1 Cor'],
  [47, '2 Cor'],
  [48, 'Gal'],
  [49, 'Eph'],
  [50, 'Phil'],
  [51, 'Col'],
  [52, '1 Thess'],
  [53, '2 Thess'],
  [54, '1 Tim'],
  [55, '2 Tim'],
  [56, 'Titus'],
  [57, 'Phlm'],
  [58, 'Heb'],
  [59, 'Jas'],
  [60, '1 Pet'],
  [61, '2 Pet'],
  [62, '1 John'],
  [63, '2 John'],
  [64, '3 John'],
  [65, 'Jude'],
  [66, 'Rev'],
]);

export const getBookAbbreviation = (bookOrder: number, fallback: string) =>
  BOOK_ABBREVIATIONS.get(bookOrder) ?? fallback.slice(0, 16);
