/**
 * Making dictation read the way it was spoken.
 *
 * Two defects sit between the recogniser and a note worth re-reading, and neither is an acoustic
 * mistake — Moonshine heard perfectly well in both cases.
 *
 * **The first is ours.** We cut the stream into utterances ourselves (`lib/voice-gate.ts`), because
 * the library gives us no VAD, no streaming path for this model, and no way to hand it a whole
 * recording. Every segment is then decoded *in isolation* by a model trained on punctuated,
 * capitalised text — so it dutifully capitalises the first word and puts a full stop at the end of
 * whatever it was given, whether or not that was a sentence. Pause for a beat in the middle of a
 * thought and "I prayed Fajr on time" comes back as `I prayed Fajr.` / `On time.` The gate's own
 * comment names this trade and accepts it, because the alternative — waiting longer before closing
 * a segment — puts the text visibly behind the voice. Stitching pays for it in a different currency:
 * a rule here, and no latency at all.
 *
 * **The second is speech.** People say "um", and start a word twice. Written down verbatim it reads
 * like a transcript of an interview rather than a diary.
 *
 * ## What this is allowed to do
 *
 * The same fence as `lib/note-vocabulary.ts`, for the same reason. This joins fragments and removes
 * sounds that were never words. It does not rephrase, reorder, shorten, or decide what you meant.
 * Every rule here is one a person could apply with a pencil and defend afterwards, and everything it
 * produces lands in a field you can edit before it is ever saved.
 *
 * Where a judgement call is genuinely close, it does nothing. A missed join reads as a slightly
 * clipped sentence; a wrong join fuses two thoughts that were separate, and you will not be able to
 * tell from the text that it happened.
 *
 * Pure, and tested — jest here matches `src/**\/*.test.ts` only, so a rule living inside a component
 * would have no test at all.
 */

import { foldText, type Vocabulary } from '@/lib/note-vocabulary';
import { appendSpoken } from '@/lib/notes';

/**
 * Sounds that were never words.
 *
 * Non-lexical only. The discourse fillers — "you know", "I mean", "sort of", "like" — are
 * deliberately absent: "sort of works", "like a rock" and "I mean it" are all lexical uses of the
 * same strings, and no regular expression can tell which one you said. That judgement needs
 * context, which is exactly the job left to a model.
 *
 * `mm` is absent too, and for a duller reason: millimetres.
 */
const FILLERS = ['um', 'umm', 'ummm', 'uh', 'uhh', 'uhm', 'erm', 'hmm', 'hmmm', 'mhm'];

/**
 * Words a stutter actually lands on.
 *
 * Restricted to function words and pronouns, because those are where a false start repeats and
 * because the alternative — deduplicating any doubled word — deletes real English. "I had had
 * enough", "that that was said", "it was very very cold" are all grammatical, and a diary that
 * quietly edits them is worse than one that leaves a stutter in.
 */
const STUTTERABLE = ['i', 'the', 'a', 'and', 'to', 'of', 'in', 'it', 'is', 'was', 'he', 'she', 'they', 'we', 'you'];

/**
 * Words that open a fragment rather than a sentence — but only in a *short* segment.
 *
 * Every word here can legitimately begin an English sentence: "In the morning I prayed Fajr", "On
 * Friday I went to jumuʿah", "After work I was tired". What distinguishes those from a fragment the
 * gate cut off is not the opening word, it is the *length*: a genuine sentence carries its own
 * clause, and an orphaned adjunct is three words long. Hence {@link MAX_FRAGMENT_WORDS}, without
 * which this list would be actively harmful.
 *
 * **Deliberately excluded, and each for a reason a test now holds:**
 * - `and but so then or` — people really do start sentences with these, in speech most of all.
 * - `that which who whom whose` — "That was hard.", "Which reminds me." A short sentence opening
 *   with a demonstrative or relative pronoun is ordinary, so the length guard doesn't save us here.
 */
const CONTINUATIONS = new Set([
  'on', 'in', 'at', 'to', 'for', 'with', 'from', 'of', 'by', 'about',
  'into', 'onto', 'over', 'under', 'near', 'around', 'through',
  'after', 'before', 'during', 'until', 'since', 'while', 'though', 'although',
  'because', 'than', 'unless',
]);

/**
 * The longest a segment may be and still be read as a fragment of the one before it.
 *
 * Four, because that is roughly where an adjunct ends and a clause begins — "on time", "after
 * work", "in the morning", "because of the cold" all fit; anything carrying its own subject and
 * verb does not. The cost of getting this wrong in each direction is asymmetric, which is why it
 * sits low: a missed join leaves a short sentence, a wrong join fuses two thoughts invisibly.
 */
const MAX_FRAGMENT_WORDS = 4;

/** A word, for counting and for looking at the front of a segment — letters, marks, and the
 *  modifier letters the app's own orthography uses. */
const WORD = /[\p{L}\p{M}ʿʾʼ'’]+/gu;

/**
 * The shortest phrase whose immediate repetition is read as a decoder loop rather than as speech.
 *
 * Four, and the number is doing safety work. Offline ASR sometimes falls into a loop and emits the
 * same run of words over and over — decoding the model's own test clip cut mid-word produced *"ask
 * not what your country can do for you ask not what your country can do for you ask not what your
 * country can"* — and no rule elsewhere in this file can touch that. But people repeat themselves
 * too, and "I don't know what to do, I don't know what to do" is a real sentence.
 *
 * What separates them is not length, it is punctuation: a person repeating themselves for emphasis
 * pauses, and the recogniser writes that pause down. A loop has nothing between the repeats but a
 * space. {@link collapseLoops} requires exactly that, which is what makes this safe to apply at all.
 */
const MIN_LOOP_WORDS = 4;

/** Terminal punctuation, once any closing quote or bracket has been set aside. */
const TERMINAL = /[.!?]$/;

const alternation = (words: readonly string[]) => words.join('|');

/**
 * A filler, together with the punctuation the speaker's pause left around it.
 *
 * The commas either side are part of the disfluency, not of the sentence: "I went, um, home" is
 * "I went home", not "I went, home". So both are swallowed and a single space is left behind, which
 * the punctuation repair below then tidies against whatever it landed next to.
 */
const FILLER_RE = new RegExp(String.raw`\s*,?\s*\b(?:${alternation(FILLERS)})\b\s*,?\s*`, 'gi');

/** A word from {@link STUTTERABLE} repeated immediately, with or without a comma between — "I I
 *  went", "I, I went". The backreference is case-insensitive under the `i` flag, so "The the day"
 *  matches and keeps the capital from the first occurrence. */
const STUTTER_RE = new RegExp(String.raw`\b(${alternation(STUTTERABLE)})(?:\s*,?\s+\1\b)+`, 'gi');

/**
 * Clean one freshly decoded segment.
 *
 * Runs on raw recogniser output and nothing else — never on text you typed, and never on a note you
 * have already read and saved. Returns `''` for a segment that was *only* filler, which the caller
 * must treat as "nothing was said" rather than as an empty sentence.
 */
export function tidyDictation(text: string): string {
  const startedCapitalised = /^\s*\p{Lu}/u.test(text);

  const cleaned = collapseLoops(text.replace(FILLER_RE, ' '))
    .replace(STUTTER_RE, '$1')
    // What the removals left: a space before punctuation, a doubled comma, a comma resting against
    // a full stop, an orphaned comma at the front.
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/^\s*,\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // A segment that was *only* filler leaves its punctuation behind — "Uh." reduces to ".". That is
  // nothing said, not an empty sentence, and the caller has to be able to tell the difference.
  if (!/\p{L}/u.test(cleaned)) return '';

  // "Um, the day was good." loses its capital along with the filler. Restore it only if the segment
  // had one to begin with — never impose one on a model that chose lower case.
  return startedCapitalised ? capitaliseFirst(cleaned) : cleaned;
}

/**
 * Collapse a run of words the decoder got stuck repeating.
 *
 * Takes the longest repeated phrase first, so *"a b c d a b c d"* is read as one four-word loop
 * rather than as two two-word ones, and then swallows a trailing *partial* repeat as well — a loop
 * is usually cut off mid-phrase when the audio runs out, and leaving that stub behind would be a
 * job half done.
 *
 * Fires only when the repeats are separated by whitespace alone; see {@link MIN_LOOP_WORDS} for why
 * that condition is the entire safety argument.
 */
function collapseLoops(text: string): string {
  const words = [...text.matchAll(/[\p{L}\p{M}ʿʾʼ'’]+/gu)].map((m) => ({
    folded: m[0].toLowerCase(),
    start: m.index,
    end: m.index + m[0].length,
  }));

  /** Do the `length` words at `a` repeat the `length` words at `b`, with nothing but space between
   *  this run and the one before it? */
  const repeatsAt = (a: number, b: number, length: number): boolean => {
    if (b + length > words.length) return false;
    if (/[^\s]/.test(text.slice(words[b - 1]!.end, words[b]!.start))) return false;
    for (let k = 0; k < length; k += 1) {
      if (words[a + k]!.folded !== words[b + k]!.folded) return false;
    }
    return true;
  };

  for (let i = 0; i + MIN_LOOP_WORDS * 2 <= words.length; i += 1) {
    const longest = Math.floor((words.length - i) / 2);
    for (let length = longest; length >= MIN_LOOP_WORDS; length -= 1) {
      let repeats = 1;
      while (repeatsAt(i, i + repeats * length, length)) repeats += 1;
      if (repeats === 1) continue;

      // The stub: however much of the phrase started again before the audio ran out.
      let partial = 0;
      const after = i + repeats * length;
      // Bounded by `length`: a stub as long as the phrase would have been another full repeat, and
      // `repeats` would already have counted it.
      while (partial < length && after + partial < words.length && repeatsAt(i + partial, after + partial, 1)) {
        partial += 1;
      }

      const keepTo = words[i + length - 1]!.end;
      const dropTo = words[after + partial - 1]!.end;
      // Recurse: one segment can contain more than one loop, and the cut may have brought two
      // halves of another together.
      return collapseLoops(text.slice(0, keepTo) + text.slice(dropTo));
    }
  }
  return text;
}

/**
 * Add a decoded sentence to the note, joining it to the one before when it is plainly a continuation
 * of it.
 *
 * Used in place of {@link appendSpoken} for every sentence after the first of a sitting. A new
 * sitting always opens its own paragraph and is never stitched onto the last one — hours may have
 * passed, and two thoughts from opposite ends of a day are not one sentence.
 *
 * @param vocabulary Consulted only to protect a capital: `Fajr` and `Duhā` must survive a join that
 * would otherwise lower-case whatever word the segment happens to start with. Optional, because the
 * joining rules stand on their own and are worth testing without it.
 */
export function stitchSpoken(existing: string, sentence: string, vocabulary?: Vocabulary): string {
  const before = existing.trimEnd();
  const after = sentence.trim();
  if (!after) return before.trim();
  if (!before) return after;
  if (!continuesPrevious(before, after)) return appendSpoken(before, after);
  // Only a full stop is removed, and only because the recogniser put it there for a segment rather
  // than for a sentence. A question or exclamation mark is a deliberate reading of the speaker's
  // tone, and `continuesPrevious` has already refused to join across one.
  return `${before.replace(/\.\s*$/, '')} ${decapitaliseOpening(after, vocabulary)}`;
}

/**
 * Is this segment the rest of the last one?
 *
 * Two signals, in order of how much they are trusted.
 *
 * **The recogniser didn't finish the sentence.** No terminal punctuation at all means the model
 * itself declined to close it — the strongest evidence available, and it is its own evidence rather
 * than our guess about English. Joining here is nearly free of risk.
 *
 * **A short segment opening with a word that can't stand alone.** Weaker, and fenced by
 * {@link MAX_FRAGMENT_WORDS} — see {@link CONTINUATIONS} for why the length is doing most of the
 * work and the word list very little.
 *
 * Never across `?` or `!`. Those are a claim about how the sentence was *said*, and gluing another
 * clause behind one would either destroy that claim or produce a sentence that reads as a question
 * halfway through.
 */
function continuesPrevious(before: string, after: string): boolean {
  // A closing quote or bracket sits outside the punctuation that matters: `He said "enough."` has
  // terminated, and so has `(it was late)`.
  const tail = before.replace(/["'”’)\]]+$/, '');
  if (/[!?]$/.test(tail)) return false;
  if (!TERMINAL.test(tail)) return true;

  const words = after.match(WORD) ?? [];
  if (words.length === 0 || words.length > MAX_FRAGMENT_WORDS) return false;
  return CONTINUATIONS.has(words[0]!.toLowerCase());
}

/**
 * Lower-case the word a joined segment opens with — unless it earned its capital.
 *
 * Every segment arrives capitalised, because the model capitalises whatever it is handed; that
 * capital carries no information about the word. Three kinds of word keep it anyway: the pronoun
 * `I` and its contractions, an acronym, and anything the app has an opinion about the spelling of
 * — `Fajr`, `Duhā`, `Ramaḍān`, or a habit the user named themselves.
 */
function decapitaliseOpening(text: string, vocabulary?: Vocabulary): string {
  const match = /^([^\p{L}]*)([\p{L}\p{M}ʿʾʼ'’]+)/u.exec(text);
  const lead = match?.[1];
  const word = match?.[2];
  if (lead === undefined || !word) return text;
  if (/^I(?:['’]|$)/.test(word)) return text;
  if (word.length > 1 && word === word.toUpperCase()) return text;
  const canonical = vocabulary?.get(foldText(word));
  if (canonical && /^\p{Lu}/u.test(canonical)) return text;

  const at = lead.length;
  return text.slice(0, at) + text.charAt(at).toLowerCase() + text.slice(at + 1);
}

/** Upper-case the first letter, leaving anything in front of it (a quote, a bracket) alone. */
function capitaliseFirst(text: string): string {
  const at = text.search(/\p{L}/u);
  if (at < 0) return text;
  return text.slice(0, at) + text.charAt(at).toUpperCase() + text.slice(at + 1);
}
