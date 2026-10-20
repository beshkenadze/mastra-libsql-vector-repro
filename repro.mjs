import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { LibSQLVector } from '@mastra/libsql';

const url = `file:${join(mkdtempSync(join(tmpdir(), 'mastra-libsql-repro-')), 'repro.db')}`;
const DIM = 2560;
const N = 5000;
const rand = () => Array.from({ length: DIM }, () => Math.random() * 2 - 1);

const setup = new LibSQLVector({ url, id: 'setup' });
await setup.createIndex({ indexName: 'chunks', dimension: DIM });
const raw = createClient({ url });
await raw.execute('DROP INDEX chunks_vector_idx'); // no DiskANN index -> query() uses the brute-force SQL
for (let i = 0; i < N; i += 250) {
  await setup.upsert({ indexName: 'chunks', vectors: Array.from({ length: 250 }, rand) });
}
await setup.close();

const store = new LibSQLVector({ url, id: 'bench' }); // fresh instance, discovers no chunks_vector_idx
const q = rand();

console.time('LibSQLVector.query');
const viaMastra = await store.query({ indexName: 'chunks', queryVector: q, topK: 10 });
console.timeEnd('LibSQLVector.query');

// The same SQL that query() sends, except the vector is bound once via vector32(?)
console.time('vector32(?)');
const { rows } = await raw.execute({
  sql: `WITH vector_scores AS (
          SELECT vector_id AS id, (1 - vector_distance_cos(embedding, vector32(?))) AS score, metadata
          FROM chunks
        )
        SELECT * FROM vector_scores WHERE score > ? ORDER BY score DESC LIMIT ?`,
  args: [JSON.stringify(q), -1, 10],
});
console.timeEnd('vector32(?)');

const same = JSON.stringify(viaMastra.map(r => [r.id, r.score])) === JSON.stringify(rows.map(r => [r.id, r.score]));
console.log('same ids and scores:', same);
