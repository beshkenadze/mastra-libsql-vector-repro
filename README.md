# `LibSQLVector.query()` brute-force scan re-parses the query vector for every row

Minimal reproduction for a `@mastra/libsql` bug.

When `LibSQLVector.query()` does not use the DiskANN index, it runs a full-table scan. That scan puts the query vector into the SQL as a JSON text literal:

```sql
(1-vector_distance_cos(embedding, '[0.71,-0.12,…]')) as score
```

libSQL parses that text into a vector on every `vector_distance_cos()` call, so once or twice per scanned row. At 2,560 dimensions the literal is about 50 KB.

This is a plain Node script, not a `create-mastra` project: the bug is in `@mastra/libsql` alone and needs no agent, model or server.

## Expected vs actual

- **Expected:** the query vector is converted once per query, the same way `queryWithIndex()` already does with `vector32(?)`. A search over 5,000 vectors takes tens of milliseconds.
- **Actual:** the same search takes about 7 seconds. The results are the same either way.

## Steps

```sh
git clone https://github.com/beshkenadze/mastra-libsql-vector-repro
cd mastra-libsql-vector-repro
npm install
npm start
```

`npm start` runs `repro.mjs`. The slow call is `store.query(...)`, printed as `LibSQLVector.query`.

`repro.mjs` creates a fresh database in a temp directory and an index with `LibSQLVector.createIndex()`. It then drops `chunks_vector_idx` so that `query()` takes the brute-force path, and inserts 5,000 random 2,560-dimension vectors. Last, it times two queries:

1. `LibSQLVector.query({ topK: 10 })`;
2. the same SQL that `query()` sends, but with the vector bound once as `vector32(?)`.

It needs no LLM provider and no API keys.

## Output

```
LibSQLVector.query: 6.905s
vector32(?): 45.808ms
same ids and scores: true
```

## Environment

- `@mastra/libsql` 1.26.2, `@mastra/core` 1.78.0, `@libsql/client` 0.18.0
- Node.js v26.8.1, npm 11.19.0
- macOS 27.0.1, Apple M1 Max (arm64)
