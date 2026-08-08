/**
 * Ready-made exchanges: a good act offered in the place an old routine keeps taking.
 *
 * Every entry here is one replacement implementation intention — *when [situation], I do [deed]
 * instead of [routine]* — and each part is load-bearing:
 *
 *  - the **situation** has to be one you would actually notice arriving. "Sitting down to eat" is
 *    a moment; "when I feel like it" is not, and a plan with no recognisable trigger is not a
 *    plan. This is the same requirement the stacks make of their anchors.
 *  - the **deed** has to be a real act, not the absence of one, and above all one that is actually
 *    to hand at the cue — a glass within reach, a phone that can be set down, somewhere to sit.
 *    Several here also happen to be incompatible with what they displace, which is appealing but
 *    is *not* why they are here: the one component study to test it (Sharenow et al., 1989) found
 *    a competing response worked just as well when it had nothing to do with the old behaviour.
 *    Availability is the requirement; incompatibility is a bonus nobody has demonstrated.
 *  - the **routine** is named only so you recognise the moment. It is never what gets tracked;
 *    an app that asked you to tick "did not drink soda" would be strengthening the very thing it
 *    was hired to displace.
 *
 * Nothing here is a general resolution. "Ate better" is not an exchange; "drank water instead of
 * soft drinks, sitting down to eat" is. If an entry below could not be answered yes or no by
 * bedtime, it does not belong.
 *
 * `name` is a past-tense first-person deed, like every other habit in the app, because it is read
 * at the moment of ticking — the checkmark asserts the deed is done. `insteadOf` and `cue` are
 * stored mid-sentence and lowercase, since the row renders them inside "Instead of … · …".
 * `evidence` is kept honest about strength, hadith graded and trials named, exactly as in
 * {@link SUNNAH_PRESETS}.
 *
 * Two invariants, both enforced by `exchanges.test.ts`: ids are unique, and no two entries share
 * a `name` — the name is the dedupe key against the habits a user already has.
 */

export type CuratedExchange = {
  /** Stable key, e.g. 'water-not-soft-drinks'. */
  id: string;
  /** The EXACT habit name that gets stored — keep stable; it is the dedupe key. Past tense. */
  name: string;
  /** The displaced routine, mid-sentence and lowercase: it renders after "Instead of ". */
  insteadOf: string;
  /**
   * The situation, specific enough that you notice it arrive. Renders after a middle dot, on a row
   * read at the end of a long day — so it is stripped to the moment itself ("headphones on"), not
   * a sentence about it ("when I put my headphones on"). The field is labelled WHEN in the editor
   * and follows "instead of …" in the row, so the framing is already said; repeating "when I" in
   * every entry spent a third of the line saying nothing. Keep new ones to about three words.
   */
  cue: string;
  /** What counts as held today — the unambiguous bar, in the imperative. */
  detail: string;
  /** The Sunnah source (graded honestly) or the scientific basis (trial / meta-analysis). */
  evidence: string;
};

export type CuratedExchangeGroup = {
  /** Stable key, e.g. 'table'. */
  key: string;
  /** Uppercase section header, in the voice of {@link CURATED_GROUPS}. */
  title: string;
  /** One line on why this class of urge yields to being replaced rather than resisted. */
  blurb: string;
  exchanges: CuratedExchange[];
};

export const EXCHANGE_GROUPS: CuratedExchangeGroup[] = [
  {
    key: 'table',
    title: 'THE TABLE',
    blurb: 'A meal has a clear beginning. That’s where the swap goes, before the first bite.',
    exchanges: [
      {
        id: 'water-not-soft-drinks',
        // Not the bare "Drank water": that exact name is already the `hydrate-water` preset (a
        // count goal for the day's cups), and the name is the dedupe key — a user with both
        // would end up with "Drank water" and "Drank water 2" and no way to tell them apart.
        name: 'Drank a glass of water',
        insteadOf: 'soft drinks',
        cue: 'sitting down to eat',
        detail: 'Pour it before the meal starts, so it’s the glass already in your hand.',
        evidence:
          'Across randomised trials, replacing sugar-sweetened drinks with a non-caloric one lowered BMI by about 0.31 kg/m² (Tobiassen et al., Obesity Reviews, 2024).',
      },
      {
        id: 'dates-nuts-not-sweets',
        name: 'Ate dates and nuts',
        insteadOf: 'crisps and sweets',
        cue: 'reaching for a snack',
        detail: 'A small handful on a plate, not straight from the bag.',
        evidence:
          '“A household with no dates in it is a household whose people are hungry” (Muslim 2046b). Pooled across 61 controlled trials, eating tree nuts lowered LDL cholesterol and triglycerides (Del Gobbo et al., Am J Clin Nutr, 2015).',
      },
      {
        id: 'ate-at-the-table',
        name: 'Ate at the table',
        insteadOf: 'eating in front of a screen',
        cue: 'picking up my plate',
        detail: 'Plate to the table, screen left behind. Sit down to eat.',
        evidence:
          'Eating while distracted increases how much is eaten at the meal and later in the day — a consistent finding across experimental studies (Robinson et al., Am J Clin Nutr, 2013).',
      },
    ],
  },
  {
    key: 'screen',
    title: 'THE SCREEN',
    blurb: 'You reach for your phone at the same few moments. Name one, and put something else there.',
    exchanges: [
      {
        id: 'quran-not-music',
        // Listening, not reading: at this cue the headphones are already on, so what is actually to
        // hand is something to play. Reading is not — you can do that with the playlist still
        // running. (Availability is the requirement, not incompatibility; see the header.)
        name: 'Listened to Qurʾān',
        insteadOf: 'music',
        cue: 'headphones on',
        detail: 'One sūrah counts. Play it where the playlist would have gone.',
        evidence:
          'The Prophet ﷺ said the best of you is the one who learns the Qurʾān and teaches it (Bukhari 5027).',
      },
      {
        id: 'dua-not-scrolling',
        name: 'Made duʿāʾ while waiting',
        insteadOf: 'scrolling',
        cue: 'stuck waiting',
        detail: 'One duʿāʾ in the queue or at the lights, with the phone still in your pocket.',
        evidence: 'The Prophet ﷺ called duʿāʾ “worship itself” (Abu Dawud 1479, ṣaḥīḥ).',
      },
      {
        id: 'phone-across-the-room',
        name: 'Left the phone across the room',
        insteadOf: 'scrolling in bed',
        cue: 'getting into bed',
        detail: 'Put it down out of reach before you lie down, not after.',
        evidence:
          'Having a phone within reach at bedtime — not only using one — was associated with worse sleep and more daytime sleepiness in a meta-analysis of children and adolescents (Carter et al., JAMA Pediatrics, 2016). Out of reach removes the cue instead of fighting it.',
      },
    ],
  },
  {
    key: 'tongue',
    title: 'THE TONGUE',
    blurb: 'The words are out before you decide on them, so decide on them beforehand.',
    exchanges: [
      {
        id: 'istighfar-not-backbiting',
        // "Stopped and…" because stopping mid-sentence is the competing response; the istighfār
        // is what fills the space it leaves. Also keeps it clear of the `istighfar-100` preset.
        name: 'Stopped and said istighfār',
        insteadOf: 'talking about someone',
        cue: 'catching myself',
        detail: 'Stop mid-sentence and say astaghfiru-Llāh. Once is enough.',
        evidence:
          '“…and do not backbite one another” (Qurʾān 49:12). The Prophet ﷺ taught: follow a bad deed with a good deed and it will wipe it out (Tirmidhi 1987, ḥasan ṣaḥīḥ).',
      },
      {
        id: 'good-word-not-complaining',
        // Deliberately not "Made duʿāʾ for them": that act already exists in the catalogue as
        // `dua-for-a-brother`. Saying something good also happens to be incompatible with the
        // complaint — you cannot say both in one breath — which is appealing but, per the header,
        // not the reason it is here.
        name: 'Said something good about them',
        insteadOf: 'complaining about someone',
        cue: 'someone annoys me',
        detail: 'One true good thing, out loud, to whoever was about to hear the complaint.',
        evidence:
          '“Whoever believes in Allah and the Last Day, let him speak good or stay silent” (Bukhari 6018, Muslim 47).',
      },
    ],
  },
  {
    key: 'impulse',
    title: 'THE IMPULSE',
    blurb: 'You move before you think. Pick the move now, while you’re calm.',
    exchanges: [
      {
        id: 'sat-down-sought-refuge',
        name: 'Sat down and sought refuge',
        insteadOf: 'raising my voice',
        cue: 'anger rising',
        detail: 'Sit down if you’re standing, then say aʿūdhu bi-Llāhi min al-shayṭān al-rajīm.',
        evidence:
          '“When one of you becomes angry while standing, let him sit down” (Abu Dawud 4782). And: “I know a word which, if he said it, what he finds would leave him — aʿūdhu bi-Llāhi min al-shayṭān” (Bukhari 3282).',
      },
      {
        id: 'sadaqah-not-impulse-buy',
        // "on the spot" separates it from the catalogue's daily `sadaqah` act and names the
        // thing that makes it work: it happens in the moment the money was going to move.
        name: 'Gave ṣadaqah on the spot',
        insteadOf: 'an impulse purchase',
        cue: 'about to buy',
        detail: 'Give something instead, any amount. The money moves the other way.',
        evidence: 'Ṣadaqah extinguishes sin as water extinguishes fire (Tirmidhi 2616, ḥasan ṣaḥīḥ).',
      },
    ],
  },
];

/** Every curated exchange, flat and in library order. */
export const CURATED_EXCHANGES: CuratedExchange[] = EXCHANGE_GROUPS.flatMap((g) => g.exchanges);
