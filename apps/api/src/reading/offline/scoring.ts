export type TopicScore = {
  topicId: string;
  score: number;
};

export const cosineSimilarity = (left: number[], right: number[]): number => {
  if (left.length !== right.length) {
    throw new Error(
      `Cannot compare vectors with different dimensions: ${left.length} and ${right.length}`,
    );
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];

    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
};

export const selectTopTopicScores = (
  scores: TopicScore[],
  minSimilarity: number,
  maxTopics: number,
): TopicScore[] =>
  scores
    .filter((score) => score.score >= minSimilarity)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxTopics);

export const parsePgVector = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.map(Number);
  }

  if (typeof value !== 'string') {
    throw new Error(`Unsupported pgvector value: ${String(value)}`);
  }

  return value
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .filter(Boolean)
    .map(Number);
};

export const toPgVectorLiteral = (embedding: number[]): string =>
  `[${embedding.join(',')}]`;
