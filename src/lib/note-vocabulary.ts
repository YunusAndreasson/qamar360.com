/**
 * Putting the app's own spelling back into a spoken note.
 *
 * The recogniser runs on the phone (see `hooks/use-dictation.ts`), and the model we run there —
 * Moonshine — takes no hotwords or keyterm list. Even if it did, no speech model on earth is going
 * to emit `duʿāʾ`, `ʿIshāʾ` or `Alḥamdulillāh`: those are orthography, not acoustics. What comes
 * back is "dua", "isha", "alhamdulillah" — heard correctly, written in the wrong alphabet.
 *
 * So the correction happens here, in plain JavaScript, against a vocabulary the app already owns:
 * its curated Sunnah terms plus **this user's own habit and stack names**. That is the same job a
 * cloud provider's `keyterms` parameter does, and it is better at it in the one way that matters —
 * it is deterministic, it is inspectable, and it is under test.
 *
 * **What this is allowed to do, and nothing more.** It corrects how a word is *spelled*. It never
 * changes which word was said, never rephrases, never adds or removes a sentence, never guesses
 * punctuation onto a half-finished thought. A note is the one place in this app holding words the
 * user actually chose, and a "helpful" rewrite of those is a different and much worse feature.
 * Every replacement is a fold-equal or near-fold-equal match, and it lands in a field the user can
 * edit.
 */

/** A term the app spells a particular way, and the shapes a recogniser is likely to hand back. */
type Term = { term: string; also?: string[] };

/**
 * The shortest a term may be, and why there are two answers.
 *
 * Folded matching is what makes this work at all: `Alḥamdulillāh` and "alhamdulillah" have to be
 * the same string before anything can be compared. But folding also *shortens* — `duʿāʾ` comes out
 * as three letters — and three letters is exactly where Arabic particles ("mā", "lā") collide with
 * ordinary English fragments. A diary that rewrites the word "la" is worse than one that leaves
 * "dua" alone.
 *
 * So the floor is lower for the curated list below, whose every entry has been read by a person and
 * checked against that collision, and higher for words harvested from a user's own habit names,
 * which nobody has reviewed.
 */
const MIN_CURATED_LENGTH = 3;
const MIN_HARVESTED_LENGTH = 4;

/** The longest phrase we'll try to match in one go — "in shāʾ Allāh" is three words. */
const MAX_PHRASE_WORDS = 3;

/**
 * Modifier letters and marks that carry meaning in the app's transliteration but that nobody types
 * into a search field and no recogniser will ever produce: ʿayn, hamza, and the three shapes of
 * apostrophe a keyboard might substitute for them.
 */
const MODIFIERS = /[ʿʾʼ'’‘`]/g;

/**
 * The comparison form of a piece of text: lowercase, stripped of diacritics, modifier letters,
 * hyphens and repeated whitespace.
 *
 * Used on both sides of every comparison here, and by the Journal's search
 * ({@link import('./notes').matchesQuery}) for exactly the same reason — someone looking for a
 * note about `duʿāʾ` is going to type "dua".
 *
 * NFD then dropping the combining range is what turns `ā` into `a` and `ḥ` into `h`; the modifier
 * letters are separate characters rather than marks, so they need their own pass. Guarded, because
 * a runtime without full `normalize` support should degrade to a coarser match, never throw in the
 * middle of saving someone's diary.
 */
export function foldText(input: string): string {
  let text = input.toLowerCase();
  try {
    text = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch {
    // No Unicode normalisation here — fold what we can and accept the coarser match.
  }
  return text.replace(MODIFIERS, '').replace(/[-–—]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * The terms the app spells for itself, in the forms a nightly note actually reaches for.
 *
 * Drawn from `constants/sunnah-habits.ts` and the moment set, so this file can never disagree with
 * the rest of the app about how a word is written — `Dhuhr` not `Ẓuhr`, `Duhā` not `Ḍuḥā`, because
 * that is what the habit titles say.
 *
 * `also` carries the spellings a recogniser reaches for that are too far from the canonical form
 * for the fuzzy pass to bridge: "Koran" is one edit from "quran" but only five letters long, and
 * the budget at that length is deliberately zero.
 */
const CURATED: readonly Term[] = [
  // ── The five, and the prayers around them ──────────────────────────────
  { term: 'Fajr', also: ['fajer', 'fajir'] },
  { term: 'Dhuhr', also: ['zuhr', 'duhr', 'dohr', 'zohar', 'zohr'] },
  { term: 'ʿAṣr', also: ['asr'] },
  { term: 'Maghrib', also: ['maghreb', 'magrib'] },
  { term: 'ʿIshāʾ', also: ['isha', 'eesha'] },
  { term: 'Jumuʿah', also: ['jumah', 'jumuah', 'juma'] },
  { term: 'Tahajjud', also: ['tahajud'] },
  { term: 'Witr', also: ['witir'] },
  { term: 'Duhā', also: ['duha', 'dhuha'] },
  { term: 'rakʿah', also: ['rakah', 'raka', 'rakat'] },
  { term: 'rakʿahs', also: ['rakahs', 'rakaat'] },
  { term: 'rawātib' },
  { term: 'Sunnah', also: ['sunna'] },
  { term: 'jamāʿah', also: ['jamaah', 'jamat'] },
  { term: 'masjid' },
  { term: 'adhān', also: ['athan', 'azan'] },
  { term: 'iqāmah', also: ['iqama'] },
  { term: 'wuḍūʾ', also: ['wudu', 'wudhu'] },
  { term: 'ghusl' },
  { term: 'qiblah', also: ['qibla', 'kiblah'] },
  // ── The Book ───────────────────────────────────────────────────────────
  { term: 'Qurʾān', also: ['quran', 'koran', 'qoran'] },
  { term: 'sūrah', also: ['surah', 'sura'] },
  { term: 'Sūrat', also: ['surat'] },
  { term: 'āyah', also: ['ayah', 'aya'] },
  { term: 'juzʾ', also: ['juz'] },
  { term: 'ḥadīth', also: ['hadith', 'hadeeth'] },
  { term: 'al-Kahf', also: ['alkahf', 'kahf'] },
  { term: 'al-Mulk', also: ['almulk', 'mulk'] },
  { term: 'al-Kāfirūn', also: ['alkafirun'] },
  { term: 'Āyat al-Kursī', also: ['ayatul kursi', 'ayat al kursi'] },
  // ── Remembrance ────────────────────────────────────────────────────────
  { term: 'duʿāʾ', also: ['dua', 'duaa'] },
  { term: 'dhikr', also: ['zikr', 'thikr'] },
  { term: 'adhkār', also: ['athkar', 'azkar'] },
  { term: 'istighfār', also: ['istighfar'] },
  { term: 'tasbīḥ', also: ['tasbih', 'tasbeeh'] },
  { term: 'Alḥamdulillāh', also: ['alhamdulillah', 'hamdulillah', 'al hamdulillah'] },
  { term: 'Bismillāh', also: ['bismillah'] },
  { term: 'astaghfirullāh', also: ['astaghfirullah'] },
  { term: 'in shāʾ Allāh', also: ['inshallah', 'insha allah', 'in sha allah'] },
  { term: 'mā shāʾ Allāh', also: ['mashallah', 'masha allah'] },
  { term: 'subḥān Allāh', also: ['subhanallah', 'subhan allah'] },
  { term: 'Allāhu akbar', also: ['allahu akbar', 'allah akbar'] },
  { term: 'jazāk Allāhu khayran', also: ['jazakallah khair', 'jazak allah khayr'] },
  { term: 'Allāh', also: ['allah'] },
  // ── The character of the thing ─────────────────────────────────────────
  { term: 'ṣadaqah', also: ['sadaqah', 'sadaqa'] },
  { term: 'zakāh', also: ['zakat', 'zakah'] },
  { term: 'tawbah', also: ['tawba', 'tauba'] },
  { term: 'niyyah', also: ['niyya', 'niyah'] },
  { term: 'khushūʿ', also: ['khushu'] },
  { term: 'ṣabr', also: ['sabr'] },
  { term: 'barakah', also: ['baraka'] },
  { term: 'īmān', also: ['iman', 'eman'] },
  { term: 'taqwā', also: ['taqwa'] },
  { term: 'muḥāsaba', also: ['muhasaba'] },
  // ── The calendar, and the fast ─────────────────────────────────────────
  { term: 'Ramaḍān', also: ['ramadan', 'ramzan'] },
  { term: 'Muḥarram', also: ['muharram'] },
  { term: 'Shaʿbān', also: ['shaban'] },
  { term: 'Rajab' },
  { term: 'Shawwāl', also: ['shawwal'] },
  { term: 'ʿĀshūrāʾ', also: ['ashura'] },
  { term: 'ʿArafah', also: ['arafah', 'arafat'] },
  { term: 'ṣawm', also: ['sawm'] },
  { term: 'ifṭār', also: ['iftar'] },
  { term: 'suḥūr', also: ['suhoor', 'sehri'] },
  { term: 'Tarāwīḥ', also: ['taraweeh', 'tarawih'] },
  { term: 'miswāk', also: ['miswak', 'siwak'] },
];

/** A vocabulary compiled for matching: folded form → the spelling to write. */
export type Vocabulary = ReadonlyMap<string, string>;

/**
 * Words a habit or stack name contributes, and words it doesn't.
 *
 * A name is not itself a term. Replacing the phrase "read a page of Qurʾān" wholesale would
 * capitalise "Read" in the middle of "I did read a page of Qurʾān" — the exact class of clumsy
 * rewrite this module is not allowed to make. So a name donates only its *distinctive* words: the
 * ones carrying a diacritic, and the ones a user capitalised themselves. That is what a hotword
 * list would have contained anyway.
 */
function termsFromName(name: string): string[] {
  const words = name.split(/\s+/).map((w) => w.replace(/^[^\p{L}]+|[^\p{L}ʾʿ]+$/gu, ''));
  return words.filter((word, i) => {
    if (!word) return false;
    // A diacritic or modifier letter means the app spells this word deliberately — always take it.
    if (/[^ -~]/.test(word)) return true;
    // A capital anywhere but the sentence-initial first word is the user naming something. A
    // one-word name ("Fajr", "Bedtime") is all first word, so it gets the exemption.
    return /^[A-Z]/.test(word) && (i > 0 || words.length === 1);
  });
}

/**
 * Compile the vocabulary this user's notes are corrected against: the curated terms above plus the
 * distinctive words from their own habits and stacks.
 *
 * The user's own words win a collision. Someone who renamed a stack "Zuhr" means Zuhr, and having
 * the app quietly rewrite their own spelling back to `Dhuhr` in their diary would be maddening.
 */
export function buildVocabulary(names: readonly string[] = []): Vocabulary {
  const map = new Map<string, string>();
  const add = (folded: string, spelling: string, min: number) => {
    if (folded.length >= min) map.set(folded, spelling);
  };
  for (const { term, also } of CURATED) {
    add(foldText(term), term, MIN_CURATED_LENGTH);
    for (const alias of also ?? []) add(foldText(alias), term, MIN_CURATED_LENGTH);
  }
  for (const name of names) {
    for (const word of termsFromName(name)) add(foldText(word), word, MIN_HARVESTED_LENGTH);
  }
  return map;
}

/**
 * Levenshtein distance, abandoned as soon as it exceeds `budget`.
 *
 * Bounded rather than complete because the answer is only ever compared against a threshold, and
 * this runs across every unmatched word of a note against every vocabulary entry — the one place
 * in this module where the work is quadratic.
 */
function withinDistance(a: string, b: string, budget: number): boolean {
  if (Math.abs(a.length - b.length) > budget) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(row[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
      row.push(value);
      if (value < best) best = value;
    }
    // Every remaining path runs through this row, so once all of it is over budget so is the answer.
    if (best > budget) return false;
    previous = row;
  }
  return previous[b.length]! <= budget;
}

/**
 * How wrong a word is allowed to be and still count as the same word — scaled by length, because
 * one wrong letter in four is a different word and one wrong letter in twelve is a typo. The ladder
 * is open-arabic's, tuned there against real field transcripts rather than guessed:
 * `utils/voiceMatching.ts` tightened it after five of seven fuzzy matches turned out to have
 * credited a genuinely different answer.
 *
 * Zero under six characters is the load-bearing part. "sabr" and "sabt" are one edit apart.
 */
function editBudget(length: number): number {
  if (length < 6) return 0;
  if (length < 9) return 1;
  if (length < 12) return 2;
  return 3;
}

/** The one vocabulary entry close enough to `folded`, or null if there is none — or more than one.
 *  An ambiguous near-match is left alone: a diary is no place to flip a coin. */
function fuzzyLookup(folded: string, vocabulary: Vocabulary): string | null {
  const budget = editBudget(folded.length);
  if (budget === 0) return null;
  let found: string | null = null;
  for (const [candidate, spelling] of vocabulary) {
    if (!withinDistance(folded, candidate, budget)) continue;
    if (found !== null && found !== spelling) return null;
    found = spelling;
  }
  return found;
}

/** Does a word that begins here begin a sentence? True at the start, and after `.`/`!`/`?`/newline. */
function startsSentence(text: string, at: number): boolean {
  for (let i = at - 1; i >= 0; i -= 1) {
    const ch = text[i]!;
    if (ch === ' ' || ch === '"' || ch === '“' || ch === '(') continue;
    return ch === '.' || ch === '!' || ch === '?' || ch === '\n';
  }
  return true;
}

/** `duʿāʾ` at the head of a sentence is `Duʿāʾ`. Only the first character moves, so `al-Kahf`
 *  stays `Al-Kahf` rather than becoming `AL-Kahf`. */
function capitalise(spelling: string): string {
  return spelling.charAt(0).toUpperCase() + spelling.slice(1);
}

/**
 * Rewrite a transcript in the app's own spelling.
 *
 * Walks the text word by word, trying the longest phrase first (three words, then two, then one),
 * so "in sha Allah" is corrected as one term rather than as three separate near-misses. Punctuation
 * between and after words is carried through untouched — the recogniser's full stops and commas are
 * the whole reason we chose a model that punctuates, and this pass must not disturb them.
 *
 * Only whole words match. A term never fires inside a longer word, so "Duhā" cannot appear in the
 * middle of "duhamel".
 */
export function applyVocabulary(text: string, vocabulary: Vocabulary): string {
  if (!text || vocabulary.size === 0) return text;
  // Words with their offsets, so a replacement can ask what precedes it and everything between
  // two words (spaces, commas, quotes, line breaks) can be copied across verbatim.
  const words: { text: string; start: number; end: number }[] = [];
  for (const match of text.matchAll(/[\p{L}\p{M}ʿʾʼ'’]+/gu)) {
    words.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  if (words.length === 0) return text;

  let out = '';
  let cursor = 0;
  let i = 0;
  while (i < words.length) {
    const first = words[i]!;
    let replacement: string | null = null;
    let span = 0;

    for (let n = Math.min(MAX_PHRASE_WORDS, words.length - i); n >= 1; n -= 1) {
      const last = words[i + n - 1]!;
      const between = text.slice(first.start, last.end);
      // Phrases join across plain spaces and nothing else. "Allah. Isha" is two sentences, and
      // matching a phrase over the top of that full stop would silently swallow it.
      if (n > 1 && /[^\p{L}\p{M}ʿʾʼ'’ ]/u.test(between)) continue;
      const folded = foldText(between);
      const exact = vocabulary.get(folded);
      if (exact) {
        replacement = exact;
        span = n;
        break;
      }
      // Fuzzy is single words only. Bridging an edit across a phrase boundary is how "in the
      // Allah" would become "in shāʾ Allāh", which is putting words in someone's mouth.
      if (n === 1) {
        const near = fuzzyLookup(folded, vocabulary);
        if (near) {
          replacement = near;
          span = 1;
        }
      }
    }

    if (replacement === null) {
      i += 1;
      continue;
    }
    const last = words[i + span - 1]!;
    out += text.slice(cursor, first.start);
    out += startsSentence(text, first.start) ? capitalise(replacement) : replacement;
    cursor = last.end;
    i += span;
  }
  return out + text.slice(cursor);
}
