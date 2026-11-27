export type ScriptOptions = {
  batchSize: number;
  dryRun: boolean;
  force: boolean;
  limit?: number;
  maxRetries: number;
};

export const getArgValue = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);

  return index >= 0 ? process.argv[index + 1] : undefined;
};

export const hasFlag = (name: string): boolean =>
  process.argv.includes(`--${name}`);

const readNumber = (
  name: string,
  fallback: number,
  options?: { min?: number },
): number => {
  const rawValue = getArgValue(name) ?? process.env[name.toUpperCase().replace(/-/g, '_')];

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || (options?.min && value < options.min)) {
    throw new Error(`Invalid numeric value for ${name}: ${rawValue}`);
  }

  return value;
};

export const getScriptOptions = (): ScriptOptions => ({
  batchSize: readNumber(
    'batch-size',
    Number(process.env.EMBEDDING_BATCH_SIZE ?? 100),
    { min: 1 },
  ),
  dryRun: hasFlag('dry-run'),
  force: hasFlag('force'),
  limit: getArgValue('limit')
    ? readNumber('limit', Number(process.env.LIMIT ?? 0), { min: 1 })
    : undefined,
  maxRetries: Number(process.env.EMBEDDING_MAX_RETRIES ?? 3),
});

export const getTopicScoreOptions = () => ({
  maxTopicsPerVerse: readNumber(
    'max-topics-per-verse',
    Number(process.env.MAX_TOPICS_PER_VERSE ?? 8),
    { min: 1 },
  ),
  minTopicSimilarity: readNumber(
    'min-topic-similarity',
    Number(process.env.MIN_TOPIC_SIMILARITY ?? 0.35),
  ),
});

export const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

export async function* iteratePages<T extends { id: string }>(
  fetchPage: (args: { cursor?: string; limit: number }) => Promise<T[]>,
  options: { limit?: number; pageSize: number },
): AsyncGenerator<T[], void, void> {
  let cursor: string | undefined;
  let yielded = 0;

  while (true) {
    const remaining =
      options.limit === undefined
        ? options.pageSize
        : Math.min(options.pageSize, options.limit - yielded);

    if (remaining <= 0) {
      return;
    }

    const page = await fetchPage({ cursor, limit: remaining });

    if (page.length === 0) {
      return;
    }

    yield page;
    yielded += page.length;
    cursor = page[page.length - 1]?.id;

    if (page.length < remaining) {
      return;
    }
  }
}

export const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number,
): Promise<T> => {
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;

      if (attempt > maxRetries) {
        throw error;
      }

      const delayMs = 500 * 2 ** (attempt - 1);
      console.warn(`Retrying after failure (${attempt}/${maxRetries})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};
