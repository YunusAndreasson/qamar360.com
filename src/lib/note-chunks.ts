/**
 * Cutting a day's note into pieces an embedding model can actually read.
 *
 * The model behind the Journal's semantic search takes 509 word-pieces and truncates silently past
 * that — the worst possible failure, because a half-read note still returns a plausible score. So
 * the text has to be cut here, and cut in a way that survives being scored.
 *
 * ## Why the budget is characters, and why it is well under the ceiling
 *
 * 509 word-pieces is roughly 380 English words, but this diary is not ordinary English. It is full
 * of the app's own orthography — `Alḥamdulillāh`, `duʿāʾ`, `ʿIshāʾ` — and a tokeniser trained on web
 * text fragments each of those into four or five pieces. A word budget calibrated on plain prose
 * would overflow on exactly the notes this app exists to hold.
 *
 * {@link CHUNK_BUDGET} is therefore 1,100 characters (~210 words, ~280 pieces even at a poor
 * tokenisation ratio). The asymmetry justifies the caution: an over-conservative budget costs one
 * extra chunk and a few milliseconds, while an overflowing one silently drops the end of somebody's
 * evening and never says so.
 *
 * ## Why paragraphs are the seam
 *
 * `appendToBody` in `lib/notes.ts` already joins each sitting to the last with a blank line, so a
 * note that was spoken across a morning and an evening arrives here pre-divided along the only
 * boundary the writer actually drew. Splitting there costs nothing and respects it.
 *
 * The split pattern is deliberately *more permissive* than the constant that produced it: a person
 * typing into the field makes `\n\n\n` and `\n \n` too. That is also why `PARAGRAPH_BREAK` is not
 * exported from `lib/notes.ts` and reused here — the joiner emits one exact string, the splitter
 * accepts a family, and pretending they are the same thing would be a lie that eventually bites.
 *
 * Pure, and tested.
 */

/** The most text one chunk may carry. See the module header for why it sits so far under the
 *  model's own 509-piece ceiling. */
const CHUNK_BUDGET = 1100;

/**
 * The most chunks one day's note may produce.
 *
 * Eight is 8,800 characters — around ninety minutes of continuous dictation, which is past the
 * ten-minute ceiling `voice-gate.ts` puts on a single sitting and well past any day anyone has
 * actually written. It exists so that one pathological note cannot own the whole background sweep,
 * and the tail it drops is still found by the exact substring search, which never went away.
 */
const MAX_CHUNKS = 8;

/** One blank line, however the writer or the recogniser happened to spell it. */
const PARAGRAPH_SPLIT = /\n\s*\n+/;

/** The end of a sentence, plus whatever closing quote or bracket rode along with it. */
const SENTENCE_SPLIT = /(?<=[.!?]["'”’)\]]?)\s+/;

/**
 * The chunks of one note, in the order they were written.
 *
 * An empty or whitespace-only body yields `[]` rather than `['']` — there is nothing to embed, and a
 * zero vector would score against every query.
 */
export function chunkNoteBody(body: string): string[] {
  const paragraphs = body
    .split(PARAGRAPH_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > CHUNK_BUDGET) {
      // A single sitting too long to embed whole. Flush whatever was being packed — mixing the tail
      // of one sitting into the head of an over-long one would blur the boundary the writer drew.
      if (current) chunks.push(current);
      current = '';
      for (const piece of splitLongParagraph(paragraph)) chunks.push(piece);
      continue;
    }

    // The `+ 2` is the blank line that would join them. Packing to the byte and then discovering the
    // separator pushed it over is how a budget quietly stops being one.
    const joined = current ? `${current}\n\n${paragraph}` : paragraph;
    if (joined.length <= CHUNK_BUDGET) {
      current = joined;
    } else {
      if (current) chunks.push(current);
      current = paragraph;
    }
  }
  if (current) chunks.push(current);

  return chunks.slice(0, MAX_CHUNKS);
}

/**
 * A short, stable fingerprint of a note's text.
 *
 * This is what decides whether a stored vector still describes the note it was made from, and it is
 * deliberately **not** `updated_at`. That column is `null` on a row this device has only just
 * written and flips to a timestamp when the server confirms it — so keying on it would re-embed
 * every note on every save, and would trust two devices' clocks to agree about which edit came last.
 * The text is the thing that actually changed or did not.
 *
 * Length is carried alongside the hash as a second, free dimension: two bodies that collide in 32
 * bits almost never also share a length. A collision costs one stale vector — a note that ranks by
 * what it used to say until it is next edited — and never a crash or a wrong note.
 */
export function noteStamp(body: string): string {
  return `${body.length.toString(36)}.${fnv1a32(body).toString(36)}`;
}

/**
 * Cut one over-long sitting at sentence ends, carrying one sentence of overlap.
 *
 * The overlap exists here and *only* here. Between paragraphs there is a boundary the writer drew
 * and duplicating across it would double-count their own structure; inside a single unbroken run of
 * speech there is no boundary at all, and a query about something said across the seam would
 * otherwise match neither side.
 */
function splitLongParagraph(paragraph: string): string[] {
  const sentences = paragraph.split(SENTENCE_SPLIT).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;

  for (const sentence of sentences) {
    if (sentence.length > CHUNK_BUDGET) {
      if (current.length) chunks.push(current.join(' '));
      current = [];
      length = 0;
      for (const piece of splitLongSentence(sentence)) chunks.push(piece);
      continue;
    }

    if (length + sentence.length + 1 > CHUNK_BUDGET && current.length) {
      chunks.push(current.join(' '));
      // Carry the last sentence forward, so a thought that straddles the cut is embedded whole
      // somewhere. Only ever one, so overlap cannot dominate the chunk it opens.
      const tail = current[current.length - 1] ?? '';
      current = tail.length < CHUNK_BUDGET / 2 ? [tail] : [];
      length = current.length ? tail.length + 1 : 0;
    }

    current.push(sentence);
    length += sentence.length + 1;
  }
  if (current.length) chunks.push(current.join(' '));

  return chunks;
}

/**
 * Last resort: one sentence longer than the whole budget.
 *
 * Cuts at a word, never inside one, on the same principle as {@link import('./notes').notePreview}
 * — a fragment ending mid-word reads as corruption, and a tokeniser handed half a word makes a piece
 * that means nothing.
 */
function splitLongSentence(sentence: string): string[] {
  const chunks: string[] = [];
  let rest = sentence;

  while (rest.length > CHUNK_BUDGET) {
    const window = rest.slice(0, CHUNK_BUDGET);
    const lastSpace = window.lastIndexOf(' ');
    // A run of 1,100 characters with no space in it is not prose — a URL, or someone leaning on a
    // key. Take the hard slice rather than emitting the entire remainder as one over-budget chunk.
    const cut = lastSpace > CHUNK_BUDGET * 0.6 ? lastSpace : CHUNK_BUDGET;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);

  return chunks;
}

/** FNV-1a, 32-bit. `Math.imul` because the multiply overflows a double's integer range otherwise,
 *  and `>>> 0` to read the result back as unsigned. */
function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
