/**
 * Ingest .txt and .md files from a directory into Atlas.
 *
 *   npm run ingest -- ./data
 */
import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { chunkText } from '../src/chunk.js';
import { embedBatch } from '../src/embeddings.js';
import { getCollection, close } from '../src/db.js';
import type { Chunk } from '../src/types.js';

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: npm run ingest -- <directory>');
    process.exit(1);
  }

  const files = (await readdir(dir)).filter((f) =>
    ['.txt', '.md'].includes(extname(f).toLowerCase()),
  );

  if (files.length === 0) {
    console.error(`No .txt or .md files found in ${dir}`);
    process.exit(1);
  }

  const col = await getCollection();
  let total = 0;

  for (const file of files) {
    const path = join(dir, file);
    const raw = await readFile(path, 'utf8');
    const pieces = chunkText(raw);

    if (pieces.length === 0) {
      console.log(`  ${file}: empty, skipped`);
      continue;
    }

    console.log(`  ${file}: ${pieces.length} chunks, embedding...`);
    const vectors = await embedBatch(pieces.map((p) => p.text));

    const docs: Chunk[] = pieces.map((p, i) => ({
      source: path,
      title: basename(file, extname(file)),
      ordinal: p.ordinal,
      text: p.text,
      embedding: vectors[i],
      createdAt: new Date(),
    }));

    // Re-ingesting the same file should replace, not duplicate. Duplicate
    // chunks are quietly corrosive: they crowd out other sources in the
    // top-k and make the model more confident about whatever was duplicated.
    await col.deleteMany({ source: path });
    await col.insertMany(docs);

    total += docs.length;
  }

  console.log(`\nIngested ${total} chunks from ${files.length} file(s).`);
  console.log('Reminder: create the Atlas Search indexes before querying.');
  console.log('See indexes/README.md.');

  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
