/**
 * The app's two "why this works" guides — habit stacking and exchanges — as data rather than JSX.
 *
 * They are halves of one idea: a stack *adds* a deed to the day; an exchange puts one *where* an
 * old routine keeps taking its place. So they share one shape, one renderer, and two homes each —
 * inline at the head of the library you are choosing from ({@link GuideIntro}), and as a screen of
 * their own from Settings → Guide ({@link GuideScreen}).
 *
 * **Why the copy moved out of the components.** Both guides used to be four paragraphs of JSX with
 * the claim run into the body — *"**Anchor, don't add.** A stack attaches…"* — because they were
 * rendered in a `fitToContents` sheet that could not scroll. Four paragraphs of one size, with
 * every citation folded into a parenthesis mid-sentence. Splitting `heading`, `body` and
 * `evidence` into fields is what lets the renderer give each its own voice, and holds the two
 * guides to the same shape so neither drifts.
 *
 * **The Sunnah leads.** Where a claim has both a scriptural and an experimental basis, the hadith
 * or āyah comes first and the trial corroborates — not the other way round. `evidence` is graded
 * honestly, exactly as in {@link SUNNAH_PRESETS} and {@link EXCHANGE_GROUPS}: a ḥasan is called
 * ḥasan, and a hadith authenticated only in its chain is called a ṣaḥīḥ chain. Never round a
 * grading up to make a point land harder. Collection names stay undiacriticised (Bukhari, Muslim,
 * Abu Dawud) and Arabic terms keep their full diacritics (wuḍūʾ, rakʿah, ṣaḥīḥ), matching the
 * catalogues.
 */

// `ImageRequireSource` (i.e. the number a bundled `require()` resolves to), not the broader
// `ImageSourcePropType` — that union includes URI-source arrays, which expo-image's `source`
// does not accept.
import type { ImageRequireSource } from 'react-native';

export type GuideSection = {
  /** The claim, complete and stopped. Unique within a guide — it keys the rendered list. */
  heading: string;
  body: string;
  /** The Qurʾān / hadith (graded) or the trial behind the claim — its own quiet line, never
   *  buried mid-paragraph. Omitted where a section is a statement of how the app works rather
   *  than a claim about the world. */
  evidence?: string;
};

export type Guide = {
  /** Stable key; used to label the test cases. */
  id: 'stacking' | 'exchange';
  /** The nav-bar title when the guide is read on its own, and the Settings row's label. */
  title: string;
  /** One sentence under the photograph — the whole guide in a breath. */
  lede: string;
  /**
   * The disclosure label in a library intro. Deliberately NOT "Why this works": every curated
   * exchange card one level down the same screen already carries that phrase for its own
   * evidence, and the same words at two scopes on one screen would be a genuine ambiguity.
   */
  why: string;
  image: ImageRequireSource;
  sections: GuideSection[];
};

export const STACKING_GUIDE: Guide = {
  id: 'stacking',
  title: 'Habit stacking',
  lede: 'Anchor a stack to something you already do — the cue you never forget.',
  why: 'Why anchoring works',
  image: require('../../assets/images/guide-stacking.webp'),
  sections: [
    {
      heading: 'Anchor, don’t add.',
      body: 'A stack attaches a good deed to something already fixed in your day — after wuḍūʾ, two rakʿah; after Fajr, one page. You are not asked to remember the deed, only to keep the moment you were keeping anyway.',
      evidence:
        'The Prophet ﷺ told Bilāl he had heard his footsteps ahead of him in Paradise, and asked what deed he had done. Bilāl answered that he never made wuḍūʾ, by night or by day, without praying with it (Bukhari 1149).',
    },
    {
      heading: 'The day is already built this way.',
      body: 'Almost nothing in the Sunnah is set by the clock. It is set by acts and by the sky — after this prayer, on rising, when you sit down to eat. Behavioural research arrived at the same shape and called it an if–then plan: a deed tied to a cue that already fires survives where one floating loose does not.',
      evidence:
        'Twelve rakʿah a day beyond the obligatory, each attached to a prayer (Muslim 728); the tasbīḥ after every prescribed prayer (Muslim 596); the siwāk the Prophet ﷺ said he would have commanded at every prayer, had it not been a burden on his ummah (Bukhari 887).',
    },
    {
      heading: 'Read it until you know it.',
      body: 'A stack’s acts are not a checklist to tick one at a time — they are a short sequence to learn. Read it each time you open the app, and before long you will not need to.',
    },
    {
      heading: 'Finish it in one go.',
      body: 'One tap seals the whole stack, and that is the only thing the app records. So keep the sequence short enough that you can always finish it: a stack you complete every day is worth more than one you abandon by the third.',
      evidence: 'The deeds most beloved to Allah are those kept consistently, even when small (Bukhari 6464; Muslim 783b).',
    },
  ],
};

export const EXCHANGE_GUIDE: Guide = {
  id: 'exchange',
  title: 'Exchanges',
  lede: 'Put a good act where an old one keeps happening — the same moment, a different answer.',
  why: 'Why replacing works',
  image: require('../../assets/images/guide-exchange.webp'),
  sections: [
    {
      heading: 'Replace, don’t resist.',
      body: 'A plan phrased as a refusal keeps the thing it names in mind — when this was tested, it made the old habit stronger, not weaker. A plan that names something to do instead displaces it. So this app never asks you to tick “didn’t”: what you record is the deed.',
      evidence:
        '“Repel [evil] with that which is better” (Qurʾān 41:34). And the Prophet ﷺ said: follow a bad deed with a good deed and it will wipe it out (Tirmidhi 1987, ḥasan ṣaḥīḥ).',
    },
    {
      heading: 'A good deed erases the one before it.',
      body: 'This is what the word exchange is doing here. You are not merely swapping one act for another — the trade is weighted, and not against you.',
      evidence:
        'A man kissed a woman unlawfully and came to the Prophet ﷺ; then “indeed, good deeds do away with misdeeds” was revealed (Qurʾān 11:114; Bukhari 526). And: “You will not give up anything for Allah but that Allah replaces it for you with something better” (Musnad Ahmad 23074, ṣaḥīḥ chain).',
    },
    {
      heading: 'Name the moment it hits.',
      body: 'Not “eat better” — “drank a glass of water instead of soft drinks, when I sit down to eat”. The urge arrives in a handful of very particular moments, and a plan that names none of them has nowhere to fire. Pick something that is actually to hand when it does.',
      evidence: 'The Prophet ﷺ told a man who was angry while standing to sit down (Abu Dawud 4782).',
    },
    {
      heading: 'A slip is not a collapse.',
      body: 'When this was measured, one missed day cost almost nothing; it was missing a whole week that predicted giving up. So a day that didn’t hold records nothing at all — no red, no broken streak. Take account of yourself at day’s end, mark what held, and begin again.',
    },
  ],
};
