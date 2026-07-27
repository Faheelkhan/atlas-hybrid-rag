import type { Collection } from 'mongodb';
import { config } from './config.js';
import { embedOne } from './embeddings.js';
import type { Chunk, RetrievalMode, RetrievalResult, ScoredChunk } from './types.js';

interface RankedHit {
  id: string;
  doc: Omit<Chunk, 'embedding'>;
  score: number;
  rank: number;
}

/**
 * Vector search via $vectorSearch.
 *
 * Note the projection: we exclude `embedding`. Returning 1,536 floats per
 * hit for 20 hits is ~250KB of payload you immediately throw away. On a
 * hot path this alone was a measurable share of our response time.
 */
async function vectorSearch(
  col: Collection<Chunk>,
  queryVector: number[],
  filter?: Record<string, unknown>,
): Promise<RankedHit[]> {
  const stage: Record<string, unknown> = {
    index: config.vectorIndex,
    path: 'embedding',
    queryVector,
    numCandidates: config.numCandidates,
    limit: config.vectorLimit,
  };
  if (filter) stage.filter = filter;

  const docs = await col
    .aggregate([
      { $vectorSearch: stage },
      {
        $project: {
          embedding: 0,
          score: { $meta: 'vectorSearchScore' },
          source: 1,
          title: 1,
          ordinal: 1,
          text: 1,
          metadata: 1,
          createdAt: 1,
        },
      },
    ])
    .toArray();

  return docs.map((doc: any, i) => ({
    id: String(doc._id),
    doc: doc as Omit<Chunk, 'embedding'>,
    score: doc.score,
    rank: i + 1,
  }));
}

/**
 * Full-text search via $search.
 *
 * This is the half that pure-vector RAG throws away, and it is the half
 * that handles exact identifiers: SKUs, error codes, version numbers,
 * proper nouns. Embeddings are bad at "PKR 4,800" and "CVE-2025-55182".
 * Lexical search is excellent at them.
 */
async function textSearch(
  col: Collection<Chunk>,
  query: string,
  filter?: Record<string, unknown>,
): Promise<RankedHit[]> {
  const pipeline: Record<string, unknown>[] = [
    {
      $search: {
        index: config.textIndex,
        text: {
          query,
          path: 'text',
          // fuzzy costs recall precision but rescues typos and inflections.
          // maxEdits 1 is safe; 2 starts matching unrelated words.
          fuzzy: { maxEdits: 1, prefixLength: 3 },
        },
      },
    },
    { $limit: config.textLimit },
    {
      $project: {
        embedding: 0,
        score: { $meta: 'searchScore' },
        source: 1,
        title: 1,
        ordinal: 1,
        text: 1,
        metadata: 1,
        createdAt: 1,
      },
    },
  ];

  if (filter) pipeline.splice(1, 0, { $match: filter });

  const docs = await col.aggregate(pipeline).toArray();

  return docs.map((doc: any, i) => ({
    id: String(doc._id),
    doc: doc as Omit<Chunk, 'embedding'>,
    score: doc.score,
    rank: i + 1,
  }));
}

/**
 * Reciprocal Rank Fusion.
 *
 * Why RRF and not a weighted sum of scores: $vectorSearchScore is cosine
 * similarity normalised to 0-1, while $searchScore is unbounded Lucene BM25
 * and routinely exceeds 10. Adding them together — which a lot of published
 * examples do — means the lexical side silently dominates. RRF ignores score
 * magnitudes entirely and fuses on rank position, so the two systems
 * contribute comparably without any normalisation guesswork.
 *
 *   rrf(d) = sum over each result list of  1 / (k + rank(d))
 */
function fuse(vectorHits: RankedHit[], textHits: RankedHit[]): ScoredChunk[] {
  const k = config.rrfK;
  const merged = new Map<string, ScoredChunk>();

  const add = (hit: RankedHit, kind: 'vector' | 'text') => {
    const existing = merged.get(hit.id);
    const contribution = 1 / (k + hit.rank);

    if (existing) {
      existing.rrfScore += contribution;
      if (kind === 'vector') existing.vectorRank = hit.rank;
      else existing.textRank = hit.rank;
      return;
    }

    merged.set(hit.id, {
      ...hit.doc,
      score: hit.score,
      vectorRank: kind === 'vector' ? hit.rank : null,
      textRank: kind === 'text' ? hit.rank : null,
      rrfScore: contribution,
    });
  };

  vectorHits.forEach((h) => add(h, 'vector'));
  textHits.forEach((h) => add(h, 'text'));

  return [...merged.values()].sort((a, b) => b.rrfScore - a.rrfScore);
}

export async function retrieve(
  col: Collection<Chunk>,
  query: string,
  opts: { mode?: RetrievalMode; filter?: Record<string, unknown>; limit?: number } = {},
): Promise<RetrievalResult> {
  const mode = opts.mode ?? 'hybrid';
  const limit = opts.limit ?? config.finalContextChunks;
  const t0 = Date.now();

  let embedMs = 0;
  let queryVector: number[] = [];

  if (mode !== 'text') {
    const tEmbed = Date.now();
    queryVector = await embedOne(query);
    embedMs = Date.now() - tEmbed;
  }

  // Run both arms concurrently. Sequential costs you the sum of two round
  // trips for no reason — they are independent queries.
  const tSearch = Date.now();
  const [vectorHits, textHits] = await Promise.all([
    mode === 'text' ? Promise.resolve([]) : vectorSearch(col, queryVector, opts.filter),
    mode === 'vector' ? Promise.resolve([]) : textSearch(col, query, opts.filter),
  ]);
  const searchMs = Date.now() - tSearch;

  const fused = fuse(vectorHits, textHits);

  return {
    chunks: fused.slice(0, limit),
    timings: {
      embedMs,
      vectorMs: mode === 'text' ? 0 : searchMs,
      textMs: mode === 'vector' ? 0 : searchMs,
      totalMs: Date.now() - t0,
    },
  };
}
