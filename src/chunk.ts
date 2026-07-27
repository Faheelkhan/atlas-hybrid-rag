import { config } from './config.js';

export interface RawChunk {
  text: string;
  ordinal: number;
}

/**
 * Paragraph-aware chunking with overlap.
 *
 * Fixed-width character splitting is the default in most tutorials and it
 * is the single most common cause of bad retrieval I have seen: it cuts
 * sentences in half, so the embedding describes half a thought and the
 * retrieved context reads as a fragment.
 *
 * This packs whole paragraphs up to a size budget, only falling back to
 * sentence splitting when a single paragraph exceeds the budget on its own.
 */
export function chunkText(input: string): RawChunk[] {
  const paragraphs = input
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const pieces: string[] = [];

  for (const para of paragraphs) {
    if (para.length <= config.chunkSize) {
      pieces.push(para);
    } else {
      pieces.push(...splitSentences(para, config.chunkSize));
    }
  }

  // Pack pieces into chunks up to the size budget.
  const packed: string[] = [];
  let current = '';

  for (const piece of pieces) {
    if (!current) {
      current = piece;
    } else if (current.length + 1 + piece.length <= config.chunkSize) {
      current += ' ' + piece;
    } else {
      packed.push(current);
      current = piece;
    }
  }
  if (current) packed.push(current);

  // Apply overlap by prefixing each chunk with the tail of the previous one.
  // Overlap exists so a fact that straddles a boundary is fully present in
  // at least one chunk. Without it, boundary facts are retrievable but
  // never complete.
  return packed.map((text, i) => {
    if (i === 0 || config.chunkOverlap <= 0) return { text, ordinal: i };
    const prev = packed[i - 1];
    const tail = prev.slice(Math.max(0, prev.length - config.chunkOverlap));
    return { text: `${tail} ${text}`.trim(), ordinal: i };
  });
}

function splitSentences(text: string, maxLen: number): string[] {
  // Deliberately simple. A real pipeline over legal or medical text wants
  // a proper sentence tokenizer — abbreviations break this regex.
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];

  const out: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s) continue;

    if (s.length > maxLen) {
      if (current) {
        out.push(current);
        current = '';
      }
      for (let i = 0; i < s.length; i += maxLen) {
        out.push(s.slice(i, i + maxLen));
      }
      continue;
    }

    if (!current) current = s;
    else if (current.length + 1 + s.length <= maxLen) current += ' ' + s;
    else {
      out.push(current);
      current = s;
    }
  }

  if (current) out.push(current);
  return out;
}
