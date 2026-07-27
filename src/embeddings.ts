import OpenAI from 'openai';
import { config } from './config.js';

const openai = new OpenAI({ apiKey: config.openaiApiKey });

/**
 * Embed a batch of texts.
 *
 * OpenAI accepts arrays, and batching matters more than people expect:
 * embedding 1,000 chunks one-at-a-time is roughly 20x slower end-to-end
 * than batching, almost entirely from per-request overhead rather than
 * compute. 96 is a conservative batch size that stays well inside the
 * token-per-request ceiling for ~1000-char chunks.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const BATCH = 96;
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const res = await withRetry(() =>
      openai.embeddings.create({
        model: config.embeddingModel,
        input: slice,
      }),
    );

    // The API returns results in request order, but it also returns an
    // explicit index. Sorting by it is cheap insurance.
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    out.push(...sorted.map((d) => d.embedding));
  }

  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embedBatch([text]);
  return vector;
}

/**
 * Retry with exponential backoff on 429 and 5xx.
 *
 * Embedding a real corpus will hit rate limits. Without this, a 2,000-chunk
 * ingest dies about 400 chunks in and you restart from zero.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const status = error?.status ?? error?.response?.status;
      const retryable = status === 429 || (status >= 500 && status < 600);
      if (!retryable || attempt === attempts - 1) throw error;

      const delay = Math.min(1000 * 2 ** attempt, 16000) + Math.random() * 500;
      console.warn(
        `  embedding request failed (${status}), retrying in ${Math.round(delay)}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
