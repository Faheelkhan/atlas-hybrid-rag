import OpenAI from 'openai';
import type { Collection } from 'mongodb';
import { config } from './config.js';
import { retrieve } from './retrieve.js';
import type { Chunk, RetrievalMode } from './types.js';

const openai = new OpenAI({ apiKey: config.openaiApiKey });

const SYSTEM_PROMPT = `You answer questions using only the numbered context passages provided.

Rules:
- Cite the passage number in square brackets after each claim, like [2].
- If the context does not contain the answer, say so plainly. Do not use
  outside knowledge to fill gaps.
- If passages disagree, say that they disagree and cite both.
- Be concise. Do not restate the question.`;

export interface AnswerResult {
  answer: string;
  citations: { n: number; title: string; source: string; ordinal: number }[];
  timings: { retrievalMs: number; generationMs: number; totalMs: number };
}

export async function answer(
  col: Collection<Chunk>,
  question: string,
  opts: { mode?: RetrievalMode; filter?: Record<string, unknown> } = {},
): Promise<AnswerResult> {
  const t0 = Date.now();

  const { chunks, timings } = await retrieve(col, question, {
    mode: opts.mode,
    filter: opts.filter,
  });

  if (chunks.length === 0) {
    return {
      answer: "I don't have any indexed content that relates to that question.",
      citations: [],
      timings: { retrievalMs: timings.totalMs, generationMs: 0, totalMs: Date.now() - t0 },
    };
  }

  // Numbering the passages is what makes citation work. Without explicit
  // numbers the model invents its own referencing scheme and you cannot
  // programmatically verify a single claim.
  const context = chunks
    .map((c, i) => `[${i + 1}] (${c.title}, part ${c.ordinal + 1})\n${c.text}`)
    .join('\n\n');

  const tGen = Date.now();
  const completion = await openai.chat.completions.create({
    model: config.chatModel,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Context:\n\n${context}\n\nQuestion: ${question}` },
    ],
  });
  const generationMs = Date.now() - tGen;

  return {
    answer: completion.choices[0]?.message?.content?.trim() ?? '',
    citations: chunks.map((c, i) => ({
      n: i + 1,
      title: c.title,
      source: c.source,
      ordinal: c.ordinal,
    })),
    timings: { retrievalMs: timings.totalMs, generationMs, totalMs: Date.now() - t0 },
  };
}
