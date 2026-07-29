# Retrieval notes

What I tried, what worked, what I would do differently. Written because most
RAG repos show you a working pipeline and none of the decisions behind it.

---

## Why hybrid instead of pure vector

The standard RAG tutorial embeds everything, runs `$vectorSearch`, stuffs the
top-k into a prompt, and stops. That works until a user types an exact token.

Embeddings encode meaning, and exact identifiers have almost none. A product
code, a price, a CVE number, a version string, an unusual proper noun — these
are close to noise in embedding space. `"PKR 4,800"` and `"PKR 8,400"` sit
almost on top of each other. `CVE-2025-55182` embeds much like any other CVE.

Lexical search is excellent at exactly what embeddings are worst at, and vice
versa. Running both and fusing costs one extra concurrent query.

Run `npm run query -- --compare "<a query with an exact token>"` against your
own corpus. The gap is usually obvious in the first three results.

## Why RRF and not a weighted score blend

The obvious approach is `alpha * vectorScore + (1 - alpha) * textScore`. It is
also what a lot of published examples do, and it is wrong for these two systems.

`$vectorSearchScore` is cosine similarity mapped to roughly 0–1.
`$searchScore` is Lucene BM25 — unbounded, commonly 5–15, occasionally much
higher depending on corpus statistics and query length.

Add them and the lexical side dominates regardless of your alpha. Normalise
them and you are normalising against a distribution that shifts with every
query. Either way you end up hand-tuning alpha per corpus and it never quite
generalises.

Reciprocal Rank Fusion discards the magnitudes and fuses on rank position:

```
rrf(d) = Σ  1 / (k + rank_i(d))
```

No normalisation, no tuning, no per-corpus alpha. `k = 60` comes from the
original Cormack et al. paper. Lowering it weights the top ranks harder;
I have not found a corpus where moving it mattered more than fixing chunking.

The tradeoff is real: RRF throws away genuine confidence information. A vector
hit at 0.94 and one at 0.71 are treated as rank 1 and rank 2 and nothing more.
If you have a single well-characterised corpus and time to tune, a normalised
weighted blend can beat RRF. For everything else RRF is the better default.

## Chunking mattered more than anything else

Fixed-width character splitting was the largest single source of bad answers I
hit. It cuts sentences mid-clause, so the embedding describes half a thought
and the retrieved passage reads as a fragment. The model then hedges or
hallucinates the missing half.

Packing whole paragraphs up to a size budget, and only falling back to sentence
splitting when a paragraph exceeds the budget alone, fixed more retrieval
complaints than every parameter change combined.

**Overlap is not optional.** Without it, a fact spanning a chunk boundary is
retrievable but never complete. 10–15% of chunk size is a reasonable default.

**On chunk size:** 1000 characters is a compromise, not an optimum. Smaller
chunks give sharper embeddings and worse context. Larger chunks give richer
context and mushier embeddings — a 3000-character chunk covering four topics
embeds to the average of four topics, which is close to no topic at all. If
your documents have real structure, chunk on that structure rather than on a
character count.

## numCandidates is a silent recall dial

`$vectorSearch` is approximate. `numCandidates` controls how wide the HNSW
graph search goes before returning your `limit`.

Set it too low and you lose recall with no error and no warning — results come
back looking perfectly reasonable while the best match sits just outside the
search frontier. Atlas suggests 10–20x your limit; this repo uses 200 for a
limit of 20.

Raising it further costs latency and buys nothing once the true top-k is
reliably inside the frontier. Worth measuring on your own data rather than
guessing.

## Projecting away the embedding

`{ $project: { embedding: 0 } }` looks like a micro-optimisation. It is not.

1536 floats × 20 hits is roughly 250KB of BSON serialised, sent over the wire,
and deserialised — per query — that you then discard. On a hot retrieval path
this was a measurable share of end-to-end latency and it is free to fix.

## Things this repo deliberately does not do

**No reranker.** A cross-encoder over the fused top-20 is usually the next
biggest quality win after fixing chunking. It is omitted here because it adds a
second model dependency and would obscure the retrieval mechanics this repo is
meant to illustrate. If you are productionising this, add one.

**No query rewriting.** Real users ask follow-ups: "what about the other one?"
is unretrievable without conversation history folded into the query. A rewrite
step matters as soon as you have multi-turn chat.

**No evaluation harness.** This is the honest gap. Everything above is
reasoned and observed rather than measured against a labelled set. Build a
golden set of question/expected-chunk pairs and measure recall@k before
trusting any of these choices on your own corpus — including mine.

**No chunk-level access control.** If different users may see different
documents, that filter belongs in the `$vectorSearch` filter and in the index
definition, enforced server-side. Filtering after retrieval leaks the existence
of documents through result counts and latency.
