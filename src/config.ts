import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  mongoUri: required('MONGODB_URI'),
  openaiApiKey: required('OPENAI_API_KEY'),

  db: process.env.MONGODB_DB ?? 'hybrid_rag',
  collection: process.env.MONGODB_COLLECTION ?? 'chunks',

  vectorIndex: process.env.VECTOR_INDEX ?? 'chunk_vector_index',
  textIndex: process.env.TEXT_INDEX ?? 'chunk_text_index',

  // text-embedding-3-small is 1536-dim and roughly 6x cheaper than -large.
  // The index definition in indexes/ must match this number exactly or
  // $vectorSearch fails at query time, not at index creation time.
  embeddingModel: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
  embeddingDimensions: 1536,

  chatModel: process.env.CHAT_MODEL ?? 'gpt-4o-mini',

  // Chunking. See docs/retrieval-notes.md for why these numbers and not others.
  chunkSize: 1000,
  chunkOverlap: 150,

  // Retrieval. numCandidates is the HNSW search width — Atlas recommends
  // 10-20x your limit. Too low and recall drops silently; too high and
  // latency climbs with no quality gain.
  vectorLimit: 20,
  numCandidates: 200,
  textLimit: 20,

  // Reciprocal Rank Fusion constant. 60 is the value from the original
  // Cormack et al. paper and it is a reasonable default. Lower values
  // weight the top ranks more aggressively.
  rrfK: 60,

  finalContextChunks: 6,
} as const;
