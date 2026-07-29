# Index definitions

Two separate indexes. `$vectorSearch` and `$search` are different index types
in Atlas — you cannot serve both from one definition.

Create them in Atlas UI → your cluster → **Atlas Search** → **Create Index** →
**JSON Editor**, or with the Atlas CLI:

```bash
atlas clusters search indexes create --clusterName <cluster> --file indexes/vector-index.json
atlas clusters search indexes create --clusterName <cluster> --file indexes/text-index.json
```

Both must target the database and collection from your `.env`
(`hybrid_rag.chunks` by default).

## Three things that will bite you

**1. `numDimensions` must match your embedding model exactly.**
1536 for `text-embedding-3-small` and `text-embedding-ada-002`, 3072 for
`text-embedding-3-large`. A mismatch does not fail at index creation. It fails
at query time with an error that does not obviously point at the index, and if
you have already embedded a corpus you get to pay for it twice.

**2. Filter fields must be declared in the vector index.**
Any field you reference in `$vectorSearch.filter` needs a `{"type": "filter"}`
entry. Filtering on an undeclared field returns zero results rather than
raising an error — a silent failure that is genuinely unpleasant to debug.

**3. Index builds are asynchronous.**
After ingesting, the index status goes to `PENDING` then `READY`. Querying
during the build returns partial results, which looks exactly like bad recall.
Check the status before you conclude your retrieval is broken.

## On `similarity`

`cosine` is correct for OpenAI embeddings, which are normalised to unit length.
For normalised vectors cosine and `dotProduct` rank identically, and dotProduct
is marginally cheaper — a reasonable optimisation once you are sure your vectors
really are normalised. `euclidean` is the wrong choice here and will quietly
degrade your results.
