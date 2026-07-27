/**
 * Ask a question, or compare retrieval modes side by side.
 *
 *   npm run query -- "how do I rotate the signing key?"
 *   npm run query -- --compare "PKR 4,800 loafers"
 */
import { getCollection, close } from '../src/db.js';
import { retrieve } from '../src/retrieve.js';
import { answer } from '../src/answer.js';
import type { RetrievalMode } from '../src/types.js';

async function main() {
  const args = process.argv.slice(2);
  const compare = args.includes('--compare');
  const question = args.filter((a) => !a.startsWith('--')).join(' ');

  if (!question) {
    console.error('Usage: npm run query -- [--compare] "your question"');
    process.exit(1);
  }

  const col = await getCollection();

  if (compare) {
    // This is the demo that makes the case for hybrid better than any
    // amount of prose. Run it with a query containing an exact token —
    // a price, an error code, a version number — and watch pure vector
    // search miss the document that lexical search puts at rank 1.
    for (const mode of ['vector', 'text', 'hybrid'] as RetrievalMode[]) {
      const { chunks, timings } = await retrieve(col, question, { mode, limit: 5 });
      console.log(`\n=== ${mode.toUpperCase()} (${timings.totalMs}ms) ===`);
      chunks.forEach((c, i) => {
        const ranks = `v:${c.vectorRank ?? '-'} t:${c.textRank ?? '-'}`;
        const preview = c.text.slice(0, 90).replace(/\s+/g, ' ');
        console.log(
          `${i + 1}. [${ranks}] rrf=${c.rrfScore.toFixed(4)} ${c.title}#${c.ordinal}`,
        );
        console.log(`   ${preview}...`);
      });
    }
    await close();
    return;
  }

  const result = await answer(col, question);

  console.log(`\n${result.answer}\n`);
  console.log('Sources:');
  result.citations.forEach((c) => {
    console.log(`  [${c.n}] ${c.title}, part ${c.ordinal + 1} — ${c.source}`);
  });
  console.log(
    `\nretrieval ${result.timings.retrievalMs}ms · generation ${result.timings.generationMs}ms · total ${result.timings.totalMs}ms`,
  );

  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
