/**
 * Storing a sentence-embedding small enough that a diary can keep one per paragraph.
 *
 * The Journal's semantic search needs a vector for every chunk of every note, and the only local
 * store this app has is the synchronous `expo-sqlite/localStorage` shim — which holds **strings**.
 * So the question is not "where do the floats go" but "what is the cheapest honest string".
 *
 * For a year of daily notes (~456 chunks at 384 dimensions):
 *
 * | encoding | per vector | a year |
 * | --- | --- | --- |
 * | JSON number array | ~3,400 chars | 1.55 MB |
 * | base64 of `Float32Array` | 2,048 chars | 935 KB |
 * | **base64 of `Int8Array`** | **512 chars** | **233 KB** |
 *
 * ## Why quantising to a byte is free here, and not merely cheap
 *
 * The model returns **L2-normalised** vectors. No component of a unit vector can exceed 1.0, so
 * `Math.round(x * 127)` cannot overflow a signed byte *by construction* — there is no clipping case
 * to handle, and {@link encodeVector} needs no clamp. That is a property of the model's output, not
 * an assumption about this user's data, and it is pinned by a test that encodes a one-hot vector and
 * expects exactly ±127.
 *
 * The error it does introduce is uniform in ±1/254 per component (σ ≈ 0.00227). Against a unit-norm
 * float query the error on a dot product is `Σ qᵢeᵢ`, whose standard deviation is
 * `‖q‖ × 0.00227 ≈ 0.0023` — two orders of magnitude below the gap between adjacent results at any
 * threshold worth shipping. A test asserts the stronger claim that actually matters: over a hundred
 * seeded random vectors, the int8 ranking and the float32 ranking pick the same top five.
 *
 * ## Why the base64 is hand-rolled
 *
 * Hermes ships no `btoa`/`atob`, and `base64-js` is present only as a transitive dependency of React
 * Native — importing it directly would be an unlisted dependency and `knip` would say so. Thirty
 * lines here is the smaller cost, and it is the same call `note-vocabulary.ts` made for Levenshtein
 * and `id.ts` made for UUID v4.
 *
 * Pure, and tested.
 */

/** Standard base64. Not the URL-safe variant: this string is never in a URL, and `+/` keeps it the
 *  alphabet every other tool decodes without being told which flavour it is. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Reverse lookup, built once. `-1` for every byte that is not a base64 digit, which is what makes
 *  {@link decodeVector} able to reject junk without a regular expression over the whole string. */
const REVERSE = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i += 1) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/**
 * The scale a unit vector's components are multiplied by before rounding to a byte.
 *
 * 127 and not 128, so that `+1.0` and `-1.0` land symmetrically inside `Int8Array`'s range. Using
 * 128 would buy one part in 256 of precision and make `+1.0` overflow to `-128`, turning the
 * strongest possible signal into its own opposite.
 */
const SCALE = 127;

/**
 * Quantise one embedding to a base64 string.
 *
 * The caller is expected to hand over a normalised vector — everything the model in
 * `use-semantic-search.ts` returns is. Nothing here checks it, because a clamp would silently
 * disguise the one bug worth finding: an un-normalised vector means the wrong model was loaded, and
 * a rounding artefact is a much quieter symptom than a similarity score above 1.
 */
export function encodeVector(vector: Float32Array): string {
  const bytes = new Uint8Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) {
    // `| 0` after rounding, so a NaN component becomes 0 rather than poisoning the string. A NaN
    // here would otherwise encode as byte 0 anyway; being explicit costs nothing and says so.
    bytes[i] = Math.round((vector[i] ?? 0) * SCALE) | 0;
  }
  return toBase64(bytes);
}

/**
 * Read one back, or `null`.
 *
 * Never throws. A corrupt blob degrades this feature to "no semantic search" — the folded-substring
 * search in `lib/notes.ts` is untouched and still exact — where an exception would take the Journal
 * screen down with it. That asymmetry is why every failure here is a return value.
 *
 * `dims` is required rather than inferred so that a stored vector from a *different* model cannot be
 * read as a short one from this model. The cache header checks the model name too, but this is the
 * check that survives someone editing the blob by hand.
 */
export function decodeVector(encoded: string, dims: number): Int8Array | null {
  // Every 4 base64 digits carry 3 bytes. 384 is divisible by 3, so a correct string has no `=`
  // padding at all and its length is exact — which makes this one comparison the whole length check.
  if (encoded.length !== Math.ceil(dims / 3) * 4) return null;

  const out = new Int8Array(dims);
  let byte = 0;
  for (let i = 0; i < encoded.length; i += 4) {
    const a = digit(encoded, i);
    const b = digit(encoded, i + 1);
    const c = digit(encoded, i + 2);
    const d = digit(encoded, i + 3);
    if (a < 0 || b < 0 || c < 0 || d < 0) return null;

    // Assigning into an `Int8Array` truncates to eight bits and sign-extends on its own, so the
    // bytes that were written as negative components come back negative with no help from here.
    out[byte] = (a << 2) | (b >> 4);
    if (byte + 1 < dims) out[byte + 1] = (b << 4) | (c >> 2);
    if (byte + 2 < dims) out[byte + 2] = (c << 6) | d;
    byte += 3;
  }
  return out;
}

/**
 * Cosine similarity between a stored chunk and a live query.
 *
 * Both sides are unit vectors, so the cosine *is* the dot product — no norms, no division beyond
 * undoing {@link SCALE} once at the end rather than per component.
 *
 * Deliberately does not dequantise into a scratch `Float32Array` first. This runs over every chunk
 * in the archive on every settled query; allocating a 384-float buffer 456 times per keystroke-pause
 * is the kind of cost that only shows up on the oldest phone somebody owns.
 */
export function similarity(chunk: Int8Array, query: Float32Array): number {
  const length = Math.min(chunk.length, query.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += (chunk[i] ?? 0) * (query[i] ?? 0);
  return sum / SCALE;
}

/** One base64 digit, or `-1` for anything that is not one — including a character above the ASCII
 *  table, which would otherwise index past {@link REVERSE}. */
function digit(text: string, at: number): number {
  const code = text.charCodeAt(at);
  return code < 128 ? (REVERSE[code] ?? -1) : -1;
}

/** Bytes to base64. No padding branch: every caller here passes a length divisible by 3. */
function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 0x03) << 4) | (b >> 4)];
    out += ALPHABET[((b & 0x0f) << 2) | (c >> 6)];
    out += ALPHABET[c & 0x3f];
  }
  return out;
}
