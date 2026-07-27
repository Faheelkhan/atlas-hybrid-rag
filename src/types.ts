import type { ObjectId } from 'mongodb';

export interface Chunk {
  _id?: ObjectId;
  /** Source document identifier — a filename, URL, or record id. */
  source: string;
  /** Human-readable title used in citations. */
  title: string;
  /** Position of this chunk within its source document, 0-indexed. */
  ordinal: number;
  /** The chunk text that gets embedded and returned as context. */
  text: string;
  /** Embedding vector. Length must equal config.embeddingDimensions. */
  embedding: number[];
  /** Arbitrary filterable metadata. Any field used in a $vectorSearch
   *  filter must also be declared in the vector index definition. */
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/** A chunk with its retrieval scores attached. */
export interface ScoredChunk extends Omit<Chunk, 'embedding'> {
  /** Raw score from whichever pipeline produced this result. */
  score: number;
  /** 1-indexed rank within the vector results, or null if not retrieved. */
  vectorRank: number | null;
  /** 1-indexed rank within the text results, or null if not retrieved. */
  textRank: number | null;
  /** Fused Reciprocal Rank Fusion score. Higher is better. */
  rrfScore: number;
}

export interface RetrievalResult {
  chunks: ScoredChunk[];
  timings: {
    embedMs: number;
    vectorMs: number;
    textMs: number;
    totalMs: number;
  };
}

export type RetrievalMode = 'vector' | 'text' | 'hybrid';
