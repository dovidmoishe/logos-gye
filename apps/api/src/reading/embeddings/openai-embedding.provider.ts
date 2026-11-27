import OpenAI from 'openai';

import { EMBEDDING_DIMENSIONS } from '../../db/scripture';
import { EmbeddingProvider } from './embedding-provider';

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not defined');
    }

    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
  }

  async embed(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);

    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      input: texts,
      model: this.model,
    });

    const embeddings = response.data
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);

    for (const embedding of embeddings) {
      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Expected ${EMBEDDING_DIMENSIONS} embedding dimensions, received ${embedding.length}`,
        );
      }
    }

    return embeddings;
  }
}
