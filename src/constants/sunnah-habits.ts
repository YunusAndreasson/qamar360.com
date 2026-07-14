import { DAILY_SCHEDULE, describeHijriSchedule, type HijriSchedule } from '@/lib/dates';

/**
 * A curated, evidence-backed library of Sunnah habits, each worded as a SMART goal —
 * Specific, Measurable, Achievable, Relevant, Time-bound — so it is unambiguous to track.
 *
 * Pure client-side data (no DB): adding a preset just creates an ordinary habit via
 * `createHabit({ name, schedule_days, reminder_time })`. The precise `name` is the stored
 * habit; `detail` (the "what counts as done") and `evidence` (the Sunnah source) are shown
 * in the Discover UI at the moment of choosing — knowledge in the world, exactly where the
 * decision is made.
 *
 * Schedules use weekday indices 0=Sun … 6=Sat (matching `habits.schedule_days`). Presets carry
 * no reminder — this is a habit tracker, not a prayer-times app, and a fixed clock time would
 * be wrong for prayers (their times shift daily by location/season). A reminder is an opt-in
 * choice the user makes per habit in the editor, and only fires in a development build (not Expo Go).
 *
 * Hijri-date practices (the White Days, ʿĀshūrāʾ, ʿArafah, Ramaḍān) carry a `hijriSchedule`
 * instead of weekdays: `scheduledOn` places them by the Umm al-Qura date, and they are stored
 * with empty `schedule_days`. "N days within a window" fasts (e.g. the six of Shawwāl) can't yet
 * be expressed and remain omitted.
 *
 * The "Health & wellbeing" category additionally carries a few non-Sunnah, modern-evidence health
 * habits (supplements, protein, daylight, …); for those, `evidence` cites the scientific source
 * (trial / meta-analysis / guideline) rather than a hadith, kept equally honest about strength.
 */

export type SunnahCategory = {
  /** Stable key, e.g. 'salah'. */
  id: string;
  /** Section header shown above the card. */
  title: string;
};

export type SunnahPreset = {
  /** Stable key, e.g. 'fajr-on-time'. */
  id: string;
  categoryId: SunnahCategory['id'];
  /** The EXACT habit name that gets stored — keep stable; it is the dedupe key. */
  name: string;
  /** What counts as "done" today — the unambiguous, measurable bar. One or two sentences. */
  detail: string;
  /** The Sunnah source (kept honest about grading — ṣaḥīḥ / ḥasan), or, for the modern health habits, the scientific basis (a trial / meta-analysis / guideline, kept honest about strength). */
  evidence: string;
  /** Default weekday schedule (0=Sun … 6=Sat). Use `DAILY_SCHEDULE` for every day; `[]` for a Hijri preset. */
  defaultSchedule: number[];
  /** A Hijri recurrence instead of weekdays. When set, the preset is Hijri-scheduled (store `defaultSchedule: []`). */
  hijriSchedule?: HijriSchedule;
  /** A numeric daily target (a "count goal"), for presets that are naturally counted (cups, servings). */
  targetCount?: number;
  /** Unit label shown next to the count ("cups", "servings"). Only meaningful with `targetCount`. */
  targetUnit?: string;
  /** Part of the one-tap "starter set" — a balanced daily core for a new user. */
  essential?: boolean;
};

export const SUNNAH_CATEGORIES: SunnahCategory[] = [
  { id: 'salah', title: 'Daily prayers' },
  { id: 'sunnah-prayers', title: 'Sunnah & nafl prayers' },
  { id: 'quran', title: 'Qurʾān' },
  { id: 'dhikr', title: 'Dhikr & remembrance' },
  { id: 'fasting', title: 'Fasting' },
  { id: 'character', title: 'Character & charity' },
  { id: 'wellbeing', title: 'Health & wellbeing' },
];

export const SUNNAH_PRESETS: SunnahPreset[] = [
  // ── Daily prayers (salāh) ────────────────────────────────────────────────
  {
    id: 'fajr-on-time',
    categoryId: 'salah',
    name: 'Pray Fajr on time',
    detail: 'Pray the two obligatory rakʿahs of Fajr in its window — from true dawn (ṣubḥ ṣādiq) until just before sunrise.',
    evidence: 'The best deed is prayer at its appointed time (Bukhari 527, Muslim 85).',
    defaultSchedule: DAILY_SCHEDULE,
    essential: true,
  },
  {
    id: 'dhuhr-on-time',
    categoryId: 'salah',
    name: 'Pray Dhuhr on time',
    detail: 'Pray the four obligatory rakʿahs of Dhuhr in its window — from just after the sun passes its zenith (zawāl) until ʿAṣr begins.',
    evidence: 'The best deed is prayer at its appointed time (Bukhari 527, Muslim 85).',
    defaultSchedule: DAILY_SCHEDULE,
    essential: true,
  },
  {
    id: 'asr-on-time',
    categoryId: 'salah',
    name: 'Pray ʿAṣr on time',
    detail: 'Pray the four obligatory rakʿahs of ʿAṣr in its window — from when a shadow grows to equal the object casting it until sunset, ideally before the sun yellows.',
    evidence: 'Whoever misses ʿAṣr, it is as if he lost his family and wealth (Bukhari 552).',
    defaultSchedule: DAILY_SCHEDULE,
    essential: true,
  },
  {
    id: 'maghrib-on-time',
    categoryId: 'salah',
    name: 'Pray Maghrib on time',
    detail: 'Pray the three obligatory rakʿahs of Maghrib in its window — from just after sunset until the red twilight fades.',
    evidence: 'The best deed is prayer at its appointed time (Bukhari 527, Muslim 85).',
    defaultSchedule: DAILY_SCHEDULE,
    essential: true,
  },
  {
    id: 'isha-on-time',
    categoryId: 'salah',
    name: 'Pray ʿIshāʾ on time',
    detail: 'Pray the four obligatory rakʿahs of ʿIshāʾ in its window — from when the twilight fades until Islamic midnight, and no later than true dawn.',
    evidence: 'The most burdensome prayers on the hypocrites are ʿIshāʾ and Fajr (Bukhari 657, Muslim 651).',
    defaultSchedule: DAILY_SCHEDULE,
    essential: true,
  },
  {
    id: 'prayer-in-congregation',
    categoryId: 'salah',
    name: 'Pray in congregation',
    detail: 'Pray each of the five daily prayers in congregation (jamāʿah) — with at least one other person, at the masjid wherever you can. Count each prayer you make in jamāʿah.',
    evidence: 'Prayer in congregation is twenty-seven times superior to prayer alone (Bukhari 645, Muslim 650).',
    defaultSchedule: DAILY_SCHEDULE,
    targetCount: 5,
    targetUnit: 'prayers',
  },

  // ── Sunnah & nafl prayers ────────────────────────────────────────────────
  {
    id: 'sunnah-before-fajr',
    categoryId: 'sunnah-prayers',
    name: 'Two rakʿah before Fajr',
    detail: 'Pray the two Sunnah rakʿahs before the obligatory Fajr prayer.',
    evidence: 'The two rakʿahs before Fajr are better than the world and all it contains (Muslim 725).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'rawatib-12',
    categoryId: 'sunnah-prayers',
    name: 'Pray the 12 rawātib rakʿah',
    detail: 'Pray the twelve confirmed Sunnah rakʿahs across the day: 2 before Fajr, 4 before & 2 after Dhuhr, 2 after Maghrib, 2 after ʿIshāʾ. Prefer the per-prayer habits below if you’d rather track each one on its own.',
    evidence: 'Whoever prays twelve rakʿahs in a day and night, a house is built for him in Paradise (Muslim 728).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'sunnah-before-dhuhr',
    categoryId: 'sunnah-prayers',
    name: 'Four rakʿah before Dhuhr',
    detail: 'Pray the four confirmed Sunnah rakʿah before the obligatory Dhuhr prayer.',
    evidence: 'Among the twelve confirmed rawātib — four before Dhuhr (Muslim 728; Tirmidhi 415, ṣaḥīḥ); the Prophet ﷺ would not leave four before Dhuhr (Bukhari 1182).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'sunnah-after-dhuhr',
    categoryId: 'sunnah-prayers',
    name: 'Two rakʿah after Dhuhr',
    detail: 'Pray the two confirmed Sunnah rakʿah after the obligatory Dhuhr prayer.',
    evidence: 'Among the twelve confirmed rawātib — two after Dhuhr (Muslim 728; Tirmidhi 415, ṣaḥīḥ).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'sunnah-before-asr',
    categoryId: 'sunnah-prayers',
    name: 'Four rakʿah before ʿAṣr',
    detail: 'Pray four rakʿah before the obligatory ʿAṣr prayer — a recommended (not confirmed) Sunnah, prayed as two pairs.',
    evidence: 'May Allāh have mercy on a man who prays four rakʿah before ʿAṣr (Abu Dawud 1271; Tirmidhi 430, ḥasan).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'sunnah-after-maghrib',
    categoryId: 'sunnah-prayers',
    name: 'Two rakʿah after Maghrib',
    detail: 'Pray the two confirmed Sunnah rakʿah after the obligatory Maghrib prayer, at home where you can.',
    evidence: 'Among the twelve confirmed rawātib — two after Maghrib (Muslim 728; Tirmidhi 415, ṣaḥīḥ).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'sunnah-after-isha',
    categoryId: 'sunnah-prayers',
    name: 'Two rakʿah after ʿIshāʾ',
    detail: 'Pray the two confirmed Sunnah rakʿah after the obligatory ʿIshāʾ prayer, before your Witr.',
    evidence: 'Among the twelve confirmed rawātib — two after ʿIshāʾ (Muslim 728; Tirmidhi 415, ṣaḥīḥ).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'witr',
    categoryId: 'sunnah-prayers',
    name: 'Pray Witr before sleeping',
    detail: 'Pray an odd number of rakʿahs (at least one) as Witr after ʿIshāʾ, making it the last prayer of your night.',
    evidence: 'Make Witr the last of your night prayer (Bukhari 998, Muslim 751).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'duha',
    categoryId: 'sunnah-prayers',
    name: 'Pray Duhā (2 rakʿah)',
    detail: 'Pray at least two rakʿahs of Duhā in the morning — from about 15–20 minutes after sunrise until just before Dhuhr (zawāl).',
    evidence: 'Two rakʿahs of Duhā suffice as the charity due upon every joint each morning (Muslim 720).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'tahajjud',
    categoryId: 'sunnah-prayers',
    name: 'Pray Tahajjud',
    detail: 'Pray at least two rakʿahs of night prayer (Qiyām al-Layl) after waking in the last part of the night.',
    evidence: 'The best prayer after the obligatory is the night prayer (Muslim 1163).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'two-rakah-after-wudu',
    categoryId: 'sunnah-prayers',
    name: 'Two rakʿah after wuḍūʾ',
    detail: 'After completing wuḍūʾ, pray two rakʿah with full presence, before your mind wanders.',
    evidence: 'Bilāl prayed two rakʿah after every wuḍūʾ; the Prophet ﷺ heard his footsteps in Paradise (Bukhari 1149, Muslim 2458).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'tahiyyat-al-masjid',
    categoryId: 'sunnah-prayers',
    name: 'Two rakʿah on entering the masjid',
    detail: 'On any day you enter a masjid, pray two rakʿah (taḥiyyat al-masjid) before you sit down — each time you enter. On a day you don’t go, skip it.',
    evidence: 'When one of you enters the masjid, let him pray two rakʿah before sitting (Bukhari 444, Muslim 714).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'two-rakah-before-maghrib',
    categoryId: 'sunnah-prayers',
    name: 'Two rakʿah before Maghrib',
    detail: 'Between the Maghrib adhān and iqāmah, pray two light rakʿah.',
    evidence: '"Pray before Maghrib" — for whoever wishes; between every adhān and iqāmah is a prayer (Bukhari 1183, 627).',
    defaultSchedule: DAILY_SCHEDULE,
  },

  // ── Qur'an ───────────────────────────────────────────────────────────────
  {
    id: 'quran-daily-page',
    categoryId: 'quran',
    name: 'Read 1 page of Qurʾān',
    detail: 'Read at least one page of the Qurʾān today (set your own larger portion if you wish).',
    evidence: 'Read the Qurʾān, for it will intercede for its companions on the Day of Resurrection (Muslim 804).',
    defaultSchedule: DAILY_SCHEDULE,
    essential: true,
  },
  {
    id: 'surah-al-mulk',
    categoryId: 'quran',
    name: 'Recite al-Mulk at night',
    detail: 'Recite Surah al-Mulk (chapter 67) before sleeping.',
    evidence: 'A sūrah of thirty verses interceded for its companion until he was forgiven — al-Mulk (Tirmidhi 2891, ḥasan).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'surah-al-kahf-friday',
    categoryId: 'quran',
    name: 'Recite al-Kahf',
    detail: 'Recite Surah al-Kahf (chapter 18) sometime on Friday (from Maghrib Thursday through Maghrib Friday).',
    evidence: 'Whoever reads Surah al-Kahf on Friday has light between the two Fridays (al-Ḥākim/al-Bayhaqī, ṣaḥīḥ).',
    defaultSchedule: [5],
  },
  {
    id: 'baqarah-last-verses',
    categoryId: 'quran',
    name: 'Last two verses of al-Baqarah',
    detail: 'Recite the final two verses of Surah al-Baqarah (2:285–286) at night.',
    evidence: 'Whoever recites the last two verses of al-Baqarah at night, they suffice him (Bukhari 5009, Muslim 807).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'three-quls-sleep',
    categoryId: 'quran',
    name: 'Three Quls before sleep',
    detail: 'Before sleeping, recite al-Ikhlāṣ, al-Falaq, and an-Nās — cup your hands, recite into them, and wipe over yourself three times.',
    evidence: 'Each night the Prophet ﷺ recited the Muʿawwidhāt into his hands and wiped over his body (Bukhari 5017).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'al-imran-last-ten',
    categoryId: 'quran',
    name: 'Last ten āyāt of Āl ʿImrān',
    detail: 'On rising in the night or for Fajr, recite the closing ten verses of Sūrat Āl ʿImrān (3:190–200).',
    evidence: 'On waking the Prophet ﷺ recited the last ten verses of Āl ʿImrān (Bukhari 4569, Muslim 763).',
    defaultSchedule: DAILY_SCHEDULE,
  },

  // ── Dhikr & remembrance ──────────────────────────────────────────────────
  {
    id: 'morning-adhkar',
    categoryId: 'dhikr',
    name: 'Morning adhkār',
    detail: 'Say the morning remembrances (Adhkār aṣ-Ṣabāḥ) after Fajr, before sunrise.',
    evidence: 'Glorify Him in the morning and the evening (Qurʾān 33:41–42).',
    defaultSchedule: DAILY_SCHEDULE,
    essential: true,
  },
  {
    id: 'evening-adhkar',
    categoryId: 'dhikr',
    name: 'Evening adhkār',
    detail: 'Say the evening remembrances (Adhkār al-Masāʾ) between ʿAṣr and Maghrib.',
    evidence: 'Glorify Him in the morning and the evening (Qurʾān 33:41–42).',
    defaultSchedule: DAILY_SCHEDULE,
    essential: true,
  },
  {
    id: 'tasbih-after-salah',
    categoryId: 'dhikr',
    name: 'Tasbīḥ ×33 after each prayer',
    detail: 'After each obligatory prayer, say SubḥānAllāh, Alḥamdulillāh and Allāhu Akbar 33 times each, then complete the hundred with: lā ilāha illā Allāh waḥdahu lā sharīka lah, lahu-l-mulku wa lahu-l-ḥamd wa huwa ʿalā kulli shayʾin qadīr. Count each of the five prayers you complete it after.',
    evidence: 'Whoever says them after every prayer, his sins are forgiven though they be like the foam of the sea (Muslim 597).',
    defaultSchedule: DAILY_SCHEDULE,
    targetCount: 5,
    targetUnit: 'prayers',
  },
  {
    id: 'ayat-al-kursi',
    categoryId: 'dhikr',
    name: 'Āyat al-Kursī after each prayer',
    detail: 'Recite Āyat al-Kursī (Qurʾān 2:255) after each obligatory prayer. Count each of the five prayers you recite it after.',
    evidence: 'Whoever recites it after every prayer, nothing keeps him from Paradise but death (an-Nasāʾī, ṣaḥīḥ).',
    defaultSchedule: DAILY_SCHEDULE,
    targetCount: 5,
    targetUnit: 'prayers',
  },
  {
    id: 'istighfar-100',
    categoryId: 'dhikr',
    name: 'Istighfār ×100',
    detail: "Seek Allāh's forgiveness (astaghfirullāh) at least 100 times through the day.",
    evidence: 'I seek Allāh’s forgiveness and repent to Him a hundred times a day (Muslim 2702).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'salawat',
    categoryId: 'dhikr',
    name: 'Salawāt ×10 on the Prophet ﷺ',
    detail: 'Send blessings on the Prophet ﷺ at least 10 times today — increase on Fridays.',
    evidence: 'Whoever sends one blessing on me, Allāh sends ten upon him (Muslim 408).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'dua-on-waking',
    categoryId: 'dhikr',
    name: 'Duʿāʾ on waking',
    detail: 'On opening your eyes, say: Al-ḥamdu lillāhi alladhī aḥyānā baʿda mā amātanā wa ilayhi-n-nushūr.',
    evidence: 'On waking the Prophet ﷺ would say it — "Praise to Allāh who gave us life after death, and to Him is the return" (Bukhari 6312).',
    defaultSchedule: DAILY_SCHEDULE,
    essential: true,
  },
  {
    id: 'answer-the-adhan',
    categoryId: 'dhikr',
    name: 'Answer the adhān',
    detail: "When you hear the call, repeat the muʾadhdhin's words, then ask Allāh to grant the Prophet ﷺ al-wasīlah (Allāhumma rabba hādhihi-d-daʿwati-t-tāmmah…).",
    evidence: 'Repeat what the muʾadhdhin says (Bukhari 611); whoever asks al-wasīlah for me after it, my intercession is due for him (Bukhari 614).',
    defaultSchedule: DAILY_SCHEDULE,
    essential: true,
  },
  {
    id: 'dua-after-wudu',
    categoryId: 'dhikr',
    name: 'Duʿāʾ after wuḍūʾ',
    detail: 'After wuḍūʾ, say the shahādatayn: Ashhadu an lā ilāha illā Allāh waḥdahu lā sharīka lah, wa ashhadu anna Muḥammadan ʿabduhu wa rasūluh.',
    evidence: 'Whoever says it after wuḍūʾ, the eight gates of Paradise are opened for him (Muslim 234).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'dua-entering-masjid',
    categoryId: 'dhikr',
    name: 'Duʿāʾ entering & leaving the masjid',
    detail: 'On a day you go to the masjid, enter saying Allāhumma-ftaḥ lī abwāba raḥmatik and leave saying Allāhumma innī asʾaluka min faḍlik. On a day you don’t go, skip it.',
    evidence: 'The Prophet ﷺ taught this on entering and leaving the masjid (Muslim 713).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'kaffarat-al-majlis',
    categoryId: 'dhikr',
    name: 'Seal a gathering',
    detail: 'On any day you sit with others, before you leave say the expiation of the gathering (kaffārat al-majlis): Subḥānaka-llāhumma wa biḥamdik, ashhadu an lā ilāha illā ant, astaghfiruka wa atūbu ilayk. On a day with no gathering, skip it.',
    evidence: 'Whoever says it when leaving a gathering, what occurred in it is forgiven (Tirmidhi 3433, ṣaḥīḥ).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'restroom-dua',
    categoryId: 'dhikr',
    name: 'Duʿāʾ entering & leaving the restroom',
    detail: 'Enter saying Allāhumma innī aʿūdhu bika mina-l-khubthi wa-l-khabāʾith; leave saying Ghufrānak.',
    evidence: 'Entering — Bukhari 142, Muslim 375; leaving — Abu Dawud 30, Tirmidhi 7, ṣaḥīḥ.',
    defaultSchedule: DAILY_SCHEDULE,
  },

  // ── Fasting (Sunnah) ─────────────────────────────────────────────────────
  {
    id: 'fast-mon-thu',
    categoryId: 'fasting',
    name: 'Sunnah fast',
    detail: 'Fast from true dawn (Fajr) to sunset (Maghrib) on Mondays and Thursdays — no food, drink, or intimacy — having intended the fast beforehand.',
    evidence: 'Deeds are presented on Mondays and Thursdays, and I like mine presented while fasting (Tirmidhi 747, ḥasan; Muslim 1162).',
    defaultSchedule: [1, 4],
  },
  {
    id: 'fast-white-days',
    categoryId: 'fasting',
    name: 'Fast the White Days',
    detail: 'Fast the three white days — the 13th, 14th, and 15th of each Hijri month — from dawn to sunset.',
    evidence: 'Fasting three days each month is like fasting for life; the Prophet ﷺ enjoined the white days, the 13th, 14th, and 15th (Bukhari 1979; Tirmidhi 761, ṣaḥīḥ).',
    defaultSchedule: [],
    hijriSchedule: { monthDays: [13, 14, 15] },
  },
  {
    id: 'fast-arafah',
    categoryId: 'fasting',
    name: 'Fast the Day of ʿArafah',
    detail: 'Fast the Day of ʿArafah — the 9th of Dhū al-Ḥijjah — for those not performing Hajj.',
    evidence: 'Fasting the Day of ʿArafah expiates the year before and the year after (Muslim 1162).',
    defaultSchedule: [],
    hijriSchedule: { dates: [{ month: 12, day: 9 }] },
  },
  {
    id: 'fast-ashura',
    categoryId: 'fasting',
    name: 'Fast ʿĀshūrāʾ',
    detail: 'Fast ʿĀshūrāʾ — the 10th of Muḥarram — together with the 9th (Tāsūʿāʾ), as the Prophet ﷺ resolved to do.',
    evidence: 'Fasting ʿĀshūrāʾ expiates the previous year; "if I live to next year I will fast the ninth" (Muslim 1134).',
    defaultSchedule: [],
    hijriSchedule: { dates: [{ month: 1, day: 9 }, { month: 1, day: 10 }] },
  },
  {
    id: 'fast-ramadan',
    categoryId: 'fasting',
    name: 'Fast Ramaḍān',
    detail: 'Fast every day of Ramaḍān from true dawn (Fajr) to sunset (Maghrib) — the obligatory fast of the month.',
    evidence: 'The month of Ramaḍān in which the Qurʾān was revealed … so whoever sights it, let him fast it (Qurʾān 2:185).',
    defaultSchedule: [],
    hijriSchedule: { months: [9] },
  },

  // ── Character & charity ──────────────────────────────────────────────────
  {
    id: 'sadaqah-daily',
    categoryId: 'character',
    name: 'Give ṣadaqah (even a smile)',
    detail: 'Give at least one charity today — money, a helpful act, or a smile to someone you meet.',
    evidence: 'Your smiling at your brother is charity (Tirmidhi 1956, ḥasan).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'good-word',
    categoryId: 'character',
    name: 'Say a good word',
    detail: 'Say at least one kind, truthful word to someone today.',
    evidence: 'A good word is charity (Bukhari 2989, Muslim 1009).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'ties-of-kinship',
    categoryId: 'character',
    name: 'Reach out to family',
    detail: 'Call, message, or visit at least one family member today — especially one you have drifted from.',
    evidence: 'Whoever wishes for a longer life, let him keep the ties of kinship (Bukhari 5986, Muslim 2557).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'family-time',
    categoryId: 'character',
    name: 'Spend time with family',
    detail: 'Give your family unhurried time today — sit, talk, play, or share something together, with your phone away.',
    evidence: 'The best of you is the best to his family, and I am the best of you to my family (Tirmidhi 3895, ḥasan ṣaḥīḥ).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'read-beneficial',
    categoryId: 'character',
    name: 'Read something beneficial',
    detail: 'Read for a little while today — even a few pages of beneficial knowledge that helps your dīn or your life.',
    evidence: 'Whoever follows a path in search of knowledge, Allāh makes easy for him thereby a path to Paradise (Muslim 2699).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'miswak',
    categoryId: 'character',
    name: 'Use the miswāk / clean teeth',
    detail: 'Clean your teeth with the miswāk (or a brush) at least once today — ideally before a prayer or on waking.',
    evidence: 'Were it not a hardship, I would have ordered the siwāk at every prayer (Bukhari 887, Muslim 252).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'sleep-on-wudu',
    categoryId: 'character',
    name: 'Sleep upon wuḍūʾ',
    detail: 'Make wuḍūʾ before getting into bed, then lie down on your right side.',
    evidence: 'When you go to bed, perform wuḍūʾ as for prayer, then lie on your right side (Bukhari 247).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'sleeping-adhkar',
    categoryId: 'character',
    name: 'Sleeping adhkār',
    detail: 'As you lie down, say the sleeping duʿāʾ — at minimum: "Bismika Allāhumma amūtu wa aḥyā."',
    evidence: 'When the Prophet ﷺ went to bed he would say: "Bismika Allāhumma amūtu wa aḥyā" (Bukhari 6324).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'name-allah-over-food',
    categoryId: 'character',
    name: 'Name & praise Allāh over food',
    detail: 'Begin each meal with Bismillāh and end it with Alḥamdulillāh.',
    evidence: "Mention Allāh's name when you eat (Abu Dawud 3767, Tirmidhi 1858, ḥasan ṣaḥīḥ); Allāh is pleased with the servant who praises Him for his food (Muslim 2734).",
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'spread-salam',
    categoryId: 'character',
    name: 'Spread the salām',
    detail: "Greet fellow Muslims with as-salāmu ʿalaykum — those you know and those you don't.",
    evidence: 'Spread salām among you and you will love one another and enter Paradise (Muslim 54).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'dua-for-a-brother',
    categoryId: 'character',
    name: 'Duʿāʾ for someone in their absence',
    detail: "Make a sincere duʿāʾ, by name, for a fellow Muslim who isn't present.",
    evidence: 'The duʿāʾ of a Muslim for his absent brother is answered; an angel says: and for you the same (Muslim 2733).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'eat-together',
    categoryId: 'character',
    name: 'Share a meal with others',
    detail: 'Eat at least one meal today with family or others — from a shared plate where you can — rather than alone.',
    evidence: 'Eat together and not separately, for the blessing is in the company (Abu Dawud 3764, Ibn Mājah 3286, ḥasan).',
    defaultSchedule: DAILY_SCHEDULE,
  },

  // ── Health & wellbeing (Sunnah guidance with strong modern evidence) ───────
  {
    id: 'qaylulah',
    categoryId: 'wellbeing',
    name: 'Take a short midday rest',
    detail: 'Rest or nap for 10–20 minutes around midday (qaylūlah) to restore energy for the day and for night prayer.',
    evidence: 'The Companions would take a midday rest (qaylūlah), a Prophetic practice (Bukhari 940).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'moderate-eating',
    categoryId: 'wellbeing',
    name: 'Stop eating before you are full',
    detail: 'At your main meal, stop while still a little hungry — roughly a third for food, a third for drink, a third for breath.',
    evidence: 'The son of Ādam fills no vessel worse than his stomach (Tirmidhi 2380, ḥasan).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'sleep-early',
    categoryId: 'wellbeing',
    name: 'Sleep early after ʿIshāʾ',
    detail: 'Be in bed within about an hour of ʿIshāʾ, skipping the idle late night, so you can rise easily for Fajr.',
    evidence: 'The Prophet ﷺ disliked sleeping before ʿIshāʾ and idle talk after it (Bukhari 568).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'daily-walk',
    categoryId: 'wellbeing',
    name: 'Go for a walk',
    detail: 'Take a brisk walk of 10–30 minutes — make it your walk to the masjid wherever you can.',
    evidence: 'For every step toward the masjid a rank is raised and a sin erased (Muslim 666).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'exercise-daily',
    categoryId: 'wellbeing',
    name: 'Move your body',
    detail: 'Get 20–30 minutes of deliberate exercise today — a brisk walk, a run, training, or a sport — enough to raise your heart rate.',
    evidence: 'The strong believer is better and more beloved to Allāh than the weak believer, though there is good in both (Muslim 2664).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'hydrate-water',
    categoryId: 'wellbeing',
    name: 'Drink 6–8 cups of water',
    detail: 'Stay hydrated — aim for 6–8 cups across the day, drinking seated and in a few breaths rather than one gulp.',
    evidence: 'The Prophet ﷺ would drink in three breaths and forbade gulping in one (Muslim 2028).',
    defaultSchedule: DAILY_SCHEDULE,
    targetCount: 8,
    targetUnit: 'cups',
  },
  {
    id: 'gratitude',
    categoryId: 'wellbeing',
    name: 'Count a blessing',
    detail: 'Pause once today to name one specific blessing and give thanks (shukr) to Allāh for it (Alḥamdulillāh).',
    evidence: '"If you are grateful, I will surely increase you" (Qurʾān 14:7); whoever thanks not people thanks not Allāh (Tirmidhi 1954, ṣaḥīḥ).',
    defaultSchedule: DAILY_SCHEDULE,
  },

  // ── Prophetic foods (Ibn al-Qayyim, aṭ-Ṭibb an-Nabawī) ────────────────────
  {
    id: 'black-seed-daily',
    categoryId: 'wellbeing',
    name: 'Take black seed',
    detail: 'Take a small daily amount of black seed (ḥabbat al-barakah / Nigella sativa) — about half a teaspoon of the seeds or oil, often taken with honey.',
    evidence: 'In the black seed is a remedy for every disease except death (Bukhari 5688, Muslim 2215).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'dates-morning',
    categoryId: 'wellbeing',
    name: 'Eat dates in the morning',
    detail: 'Eat a few dates in the morning — the Sunnah is seven ʿAjwa dates on an empty stomach.',
    evidence: 'Whoever eats seven ʿAjwa dates in the morning, no poison or magic will harm him that day (Bukhari 5445, Muslim 2047).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'honey-daily',
    categoryId: 'wellbeing',
    name: 'Drink honey water',
    detail: 'Stir a spoon of honey into a glass of warm water and drink it — ideally in the morning, on an empty stomach.',
    evidence: 'In it is healing for people (Qurʾān 16:69); the Prophet ﷺ recommended honey for a stomach ailment (Bukhari 5684, Muslim 2217).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'olive-oil',
    categoryId: 'wellbeing',
    name: 'Use olive oil in your food',
    detail: 'Add olive oil to your food today — drizzle it over a meal or use it in cooking.',
    evidence: 'Eat olive oil and anoint yourselves with it, for it is from a blessed tree (Tirmidhi 1851, Ibn Mājah 3319, ḥasan).',
    defaultSchedule: DAILY_SCHEDULE,
  },

  // ── Daily health (non-Sunnah, easy wins with strong modern evidence) ───────
  {
    id: 'vitamin-d',
    categoryId: 'wellbeing',
    name: 'Take vitamin D3',
    detail: 'Take a vitamin D3 supplement with a meal — about 1000–2000 IU daily (confirm your own level with your doctor).',
    evidence: 'Deficiency is common with limited sun exposure or covered skin; daily D3 reliably restores healthy blood levels, though it adds no extra heart or cancer protection once you’re replete (VITAL trial, Manson et al., NEJM 2019).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'omega-3',
    categoryId: 'wellbeing',
    name: 'Take omega-3',
    detail: 'Take an omega-3 (EPA/DHA) supplement with a meal — aim for about 1g combined EPA+DHA, or eat oily fish instead.',
    evidence: 'EPA/DHA omega-3s robustly lower triglycerides (AHA Science Advisory, Circulation 2019); broad heart-disease prevention from supplements is small (Cochrane review, 2020) — most worthwhile if you rarely eat oily fish.',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'creatine',
    categoryId: 'wellbeing',
    name: 'Take creatine',
    detail: 'Take 3–5g of creatine monohydrate, mixed into water or a drink — any time of day, every day.',
    evidence: 'Among the most-studied supplements: 3–5g a day improves strength, lean mass and exercise performance with a strong safety record (ISSN Position Stand, Kreider et al., 2017). It also modestly aids memory — most in older adults and under stress or sleep loss (meta-analysis, Nutrition Reviews 2023).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'magnesium',
    categoryId: 'wellbeing',
    name: 'Take magnesium',
    detail: 'Take about 200–400mg of magnesium (glycinate or citrate) in the evening.',
    evidence: 'Low magnesium intake is widespread; supplements modestly shorten the time to fall asleep, though overall sleep-quality evidence is still limited (systematic review in older adults, 2021).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'protein-morning',
    categoryId: 'wellbeing',
    name: 'Eat 30g protein after waking',
    detail: 'Within an hour or two of waking, eat a meal with at least 30g of protein — eggs, yoghurt, a shake, or similar.',
    evidence: 'About 30g of protein per meal maximally stimulates muscle protein synthesis, and a protein-rich first meal curbs morning hunger (Mamerow et al., J. Nutr. 2014).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'multivitamin',
    categoryId: 'wellbeing',
    name: 'Take a multivitamin',
    detail: 'Take a daily multivitamin with breakfast as a simple nutritional safety-net.',
    evidence: 'A daily multivitamin fills common dietary gaps; it modestly aided cognition in older adults (COSMOS, Alzheimer’s & Dementia 2023) and lowered total cancer ~8% in older men (Physicians’ Health Study II, JAMA 2012) — real but modest benefits.',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'citicoline',
    categoryId: 'wellbeing',
    name: 'Take citicoline',
    detail: 'Take 250–500mg of citicoline (CDP-choline) with a meal — the choline form best studied for memory. Eggs are the food-first source.',
    evidence: 'Choline feeds acetylcholine, the memory neurotransmitter, and most people fall short of the recommended intake. 500mg a day improved episodic and overall memory in older adults with age-related memory decline (Nakazaki et al., J. Nutr. 2021) — promising, though industry-funded and clearest in older adults, not the already-sharp.',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'vitamin-b12',
    categoryId: 'wellbeing',
    name: 'Take vitamin B12',
    detail: 'Take a vitamin B12 supplement if you eat little or no meat, are older, or take metformin — the groups most likely to run low (confirm your level with your doctor).',
    evidence: 'A B12 shortfall is a real, reversible cause of memory and nerve trouble. Homocysteine-lowering B vitamins slowed brain shrinkage and cognitive decline in older adults with mild impairment (VITACOG, Smith et al., PLoS One 2010) — the benefit concentrated in those who were low to begin with, not everyone.',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'morning-daylight',
    categoryId: 'wellbeing',
    name: 'Get morning daylight',
    detail: 'Get 5–15 minutes of outdoor daylight within an hour of waking — step outside, even on a cloudy day.',
    evidence: 'Morning light is the strongest signal that sets your body clock, improving daytime alertness, mood and night-time sleep (Blume et al., Somnologie 2019).',
    defaultSchedule: DAILY_SCHEDULE,
  },
  {
    id: 'vegetables',
    categoryId: 'wellbeing',
    name: 'Eat 2 servings of vegetables',
    detail: 'Eat at least two servings of vegetables today — add them to meals or have them as snacks.',
    evidence: 'Higher vegetable intake tracks with much lower risk of heart disease and early death — up to ~31% lower all-cause mortality near 800g a day of fruit and veg (Aune et al., Int. J. Epidemiol. 2017).',
    defaultSchedule: DAILY_SCHEDULE,
    targetCount: 2,
    targetUnit: 'servings',
  },
  {
    id: 'walk-after-meal',
    categoryId: 'wellbeing',
    name: 'Walk after a meal',
    detail: 'Take a 10-minute walk soon after one of your main meals.',
    evidence: 'A short walk soon after eating meaningfully blunts the post-meal blood-sugar spike (meta-analysis, Sports Medicine 2022).',
    defaultSchedule: DAILY_SCHEDULE,
  },
];

/**
 * Presets for which "Add another" — a second, independent copy — is meaningful: an open-ended
 * practice you might keep in more than one part of the day (a page of Qurʾān in both a Morning and
 * an Evening stack, tracked as two ticks). Everything else in the library is a *singular* daily or
 * occasion act — you pray Dhuhr once, fast ʿĀshūrāʾ once, and a counted goal (cups of water, tasbīḥ
 * ×33) already carries its own volume — so a duplicate is nonsense and Discover hides the trailing
 * ＋. Keyed by stable preset id so it holds for both the bundled list and the Supabase catalog with
 * no schema change; add ids here as genuinely-repeatable presets appear.
 */
const REPEATABLE_PRESET_IDS = new Set<string>(['quran-daily-page']);

/** Whether Discover should offer "Add another" (an independent copy) for this preset. */
export function isRepeatablePreset(preset: SunnahPreset): boolean {
  return REPEATABLE_PRESET_IDS.has(preset.id);
}

/** One starter stack: a named group of presets added together, in this order. */
export type StarterStack = {
  /** The stack's name as created — plain English day-parts, per house style. */
  name: string;
  /** Preset ids (see `SUNNAH_PRESETS`) in stack sequence order. */
  presetIds: string[];
};

/**
 * The starter set, grouped by the moments of the day it anchors to — added as ready-made
 * stacks so a new user's very first screen already demonstrates the app's core idea. Ids
 * resolve against the live catalog at add time (a missing id just drops out), and presets the
 * user already has are skipped, so a partial re-run only fills the gaps.
 */
export const STARTER_STACKS: StarterStack[] = [
  { name: 'Morning', presetIds: ['dua-on-waking', 'fajr-on-time', 'morning-adhkar'] },
  { name: 'Midday', presetIds: ['dhuhr-on-time', 'asr-on-time'] },
  { name: 'Evening', presetIds: ['evening-adhkar', 'maghrib-on-time'] },
  { name: 'Night', presetIds: ['isha-on-time', 'quran-daily-page', 'sleeping-adhkar'] },
];

/** Starter presets with no time-of-day home (event-driven) — added standalone, after the
 *  stacks, so the first run also shows what a lone habit looks like. */
export const STARTER_STANDALONE_PRESET_IDS = ['answer-the-adhan'];

/** Short weekday names indexed 0=Sun … 6=Sat, for schedule summaries. */
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A human one-line schedule summary, e.g. "Every day", "Fri", "Mon, Thu", or — for a Hijri
 * habit — "White Days (13–15)", "Ramaḍān". Reminders are an opt-in choice the user makes per
 * habit, so they don't appear here.
 */
export function scheduleSummary(schedule: number[], hijri?: HijriSchedule | null): string {
  if (hijri) return describeHijriSchedule(hijri);
  const sorted = [...schedule].sort((a, b) => a - b);
  return sorted.length === 7 ? 'Every day' : sorted.map((d) => SHORT_WEEKDAYS[d]).join(', ') || 'No days';
}

