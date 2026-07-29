# atlas-hybrid-rag

A production-shaped RAG reference on **MongoDB Atlas**, combining
`$vectorSearch` and `$search` with Reciprocal Rank Fusion.

Most RAG examples stop at pure vector search. That works until someone types a
price, an error code, or a part number — the exact tokens embeddings are worst
at. This repo runs both retrieval arms concurrently and fuses them on rank, and
documents the decisions behind each choice rather than just the working code.

```
query ──┬─► embed ─► $vectorSearch ──┐
        │                            ├─► RRF fusion ─► top-k ─► LLM ─► cited answer
        └─────────► $search ─────────┘
```

## Quick start

```bash
npm install
cp .env.example .env          # fill in MONGODB_URI and OPENAI_API_KEY
npm run ingest -- ./data      # chunk + embed + insert
# create both Atlas indexes — see indexes/README.md
npm run query -- "your question here"
```

## See why hybrid matters

```bash
npm run query -- --compare "PKR 4,800 loafers"
```

Runs the same query three ways — vector only, text only, fused — and prints
each result with the rank it held in both arms. On queries containing exact
tokens, the document that lexical search puts at rank 1 is often missing
entirely from the vector results.

## What's here

| Path | |
|---|---|
| `src/chunk.ts` | Paragraph-aware chunking with overlap |
| `src/embeddings.ts` | Batched embeddings with backoff on 429/5xx |
| `src/retrieve.ts` | Both search arms + RRF fusion |
| `src/answer.ts` | Numbered-passage prompting with citations |
| `indexes/` | Both index definitions + the three things that bite you |
| `docs/retrieval-notes.md` | **The decisions, and what I'd do differently** |

If you read one file, read `docs/retrieval-notes.md`. The code is the easy part.

## Notable choices

**RRF over weighted score blending.** `$vectorSearchScore` is cosine, roughly
0–1. `$searchScore` is unbounded BM25. Adding them lets the lexical side
dominate silently, and normalising means normalising against a distribution
that shifts per query. RRF fuses on rank and sidesteps both problems.

**Paragraph-aware chunking.** Fixed-width splitting cuts sentences in half, so
the embedding describes half a thought. Fixing this improved answer quality more
than every parameter change combined.

**`numCandidates` at 10x the limit.** It is an approximate search width, and
setting it too low costs recall with no error and no warning.

**Projecting away `embedding`.** 1536 floats × 20 hits is ~250KB per query
serialised and thrown away. Free to fix, measurable to leave in.

Each of these is argued properly in `docs/retrieval-notes.md`, including where
the tradeoffs go the other way.

## Requirements

- MongoDB Atlas M10+ (or a free M0 for evaluation — Vector Search is available
  on shared tiers)
- Node 20+
- An OpenAI API key

## Not included, deliberately

No reranker, no query rewriting, no evaluation harness. All three matter in
production; all three would obscure the retrieval mechanics this repo exists to
show. The evaluation gap is the one I would close first — see the end of
`docs/retrieval-notes.md`.

## Licence

MIT
