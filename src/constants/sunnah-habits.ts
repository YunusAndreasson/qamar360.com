import { DAILY_SCHEDULE, describeHijriSchedule, type HijriSchedule } from '@/lib/dates';

import type MaterialIcons from '@expo/vector-icons/MaterialIcons';

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
 * Hijri-date practices (the White Days, ʿĀshūrāʾ, ʿArafah, Ramadan) carry a `hijriSchedule`
 * instead of weekdays: `scheduledOn` places them by the Umm al-Qura date, and they are stored
 * with empty `schedule_days`. "N days within a window" fasts (e.g. the six of Shawwāl) can't yet
 * be expressed and remain omitted.
 */

export type SunnahCategory = {
  /** Stable key, e.g. 'salah'. */
  id: string;
  /** Section header shown above the card. */
  title: string;
  /** Optional muted caption under the card. */
  footer?: string;
};

export type SunnahPreset = {
  /** Stable key, e.g. 'fajr-on-time'. */
  id: string;
  categoryId: SunnahCategory['id'];
  /** The EXACT habit name that gets stored — keep stable; it is the dedupe key. */
  name: string;
  /** What counts as "done" today — the unambiguous, measurable bar. One or two sentences. */
  detail: string;
  /** The Sunnah source, kept honest about grading (ṣaḥīḥ / ḥasan). */
  evidence: string;
  /** Default weekday schedule (0=Sun … 6=Sat). Use `DAILY_SCHEDULE` for every day; `[]` for a Hijri preset. */
  defaultSchedule: number[];
  /** A Hijri recurrence instead of weekdays. When set, the preset is Hijri-scheduled (store `defaultSchedule: []`). */
  hijriSchedule?: HijriSchedule;
  /** MaterialIcons glyph (rendered on both platforms, matching `SettingsRow`). */
  icon: keyof typeof MaterialIcons.glyphMap;
  /** Part of the one-tap "starter set" — a balanced daily core for a new user. */
  essential?: boolean;
};

export const SUNNAH_CATEGORIES: SunnahCategory[] = [
  { id: 'salah', title: 'Daily prayers' },
  { id: 'sunnah-prayers', title: 'Sunnah & nafl prayers' },
  { id: 'quran', title: "Qur'an" },
  { id: 'dhikr', title: 'Dhikr & remembrance' },
  { id: 'fasting', title: 'Fasting' },
  { id: 'character', title: 'Character & charity' },
  {
    id: 'wellbeing',
    title: 'Health & wellbeing',
    footer: 'Prophetic guidance for the body and mind — each also backed by strong modern evidence.',
  },
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
    icon: 'wb-twilight',
    essential: true,
  },
  {
    id: 'dhuhr-on-time',
    categoryId: 'salah',
    name: 'Pray Dhuhr on time',
    detail: 'Pray the four obligatory rakʿahs of Dhuhr in its window — from just after the sun passes its zenith (zawāl) until ʿAsr begins.',
    evidence: 'The best deed is prayer at its appointed time (Bukhari 527, Muslim 85).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'light-mode',
    essential: true,
  },
  {
    id: 'asr-on-time',
    categoryId: 'salah',
    name: 'Pray Asr on time',
    detail: 'Pray the four obligatory rakʿahs of ʿAsr in its window — from when a shadow grows to equal the object casting it until sunset, ideally before the sun yellows.',
    evidence: 'Whoever misses ʿAsr, it is as if he lost his family and wealth (Bukhari 552).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'wb-sunny',
    essential: true,
  },
  {
    id: 'maghrib-on-time',
    categoryId: 'salah',
    name: 'Pray Maghrib on time',
    detail: 'Pray the three obligatory rakʿahs of Maghrib in its window — from just after sunset until the red twilight fades.',
    evidence: 'The best deed is prayer at its appointed time (Bukhari 527, Muslim 85).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'brightness-4',
    essential: true,
  },
  {
    id: 'isha-on-time',
    categoryId: 'salah',
    name: 'Pray Isha on time',
    detail: 'Pray the four obligatory rakʿahs of ʿIshāʾ in its window — from when the twilight fades until Islamic midnight, and no later than true dawn.',
    evidence: 'The most burdensome prayers on the hypocrites are ʿIshāʾ and Fajr (Bukhari 657, Muslim 651).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'nightlight',
    essential: true,
  },
  {
    id: 'prayer-in-congregation',
    categoryId: 'salah',
    name: 'Pray in congregation',
    detail: 'Pray at least one of the five daily prayers in congregation (jamāʿah) — with at least one other person, at the masjid wherever you can.',
    evidence: 'Prayer in congregation is twenty-seven times superior to prayer alone (Bukhari 645, Muslim 650).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'groups',
  },

  // ── Sunnah & nafl prayers ────────────────────────────────────────────────
  {
    id: 'sunnah-before-fajr',
    categoryId: 'sunnah-prayers',
    name: 'Two rakʿah before Fajr',
    detail: 'Pray the two Sunnah rakʿahs before the obligatory Fajr prayer.',
    evidence: 'The two rakʿahs before Fajr are better than the world and all it contains (Muslim 725).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'wb-twilight',
  },
  {
    id: 'rawatib-12',
    categoryId: 'sunnah-prayers',
    name: 'The 12 rawātib rakʿah',
    detail: 'Pray the twelve confirmed Sunnah rakʿahs across the day: 2 before Fajr, 4 before & 2 after Dhuhr, 2 after Maghrib, 2 after ʿIshāʾ.',
    evidence: 'Whoever prays twelve rakʿahs in a day and night, a house is built for him in Paradise (Muslim 728).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'layers',
  },
  {
    id: 'witr',
    categoryId: 'sunnah-prayers',
    name: 'Pray Witr before sleeping',
    detail: 'Pray an odd number of rakʿahs (at least one) as Witr after ʿIshāʾ, making it the last prayer of your night.',
    evidence: 'Make Witr the last of your night prayer (Bukhari 998, Muslim 751).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'bedtime',
  },
  {
    id: 'duha',
    categoryId: 'sunnah-prayers',
    name: 'Pray Duhā (2 rakʿah)',
    detail: 'Pray at least two rakʿahs of Duhā in the morning — from about 15–20 minutes after sunrise until just before Dhuhr (zawāl).',
    evidence: 'Two rakʿahs of Duhā suffice as the charity due upon every joint each morning (Muslim 720).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'light-mode',
  },
  {
    id: 'tahajjud',
    categoryId: 'sunnah-prayers',
    name: 'Pray Tahajjud',
    detail: 'Pray at least two rakʿahs of night prayer (Qiyām al-Layl) after waking in the last part of the night.',
    evidence: 'The best prayer after the obligatory is the night prayer (Muslim 1163).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'nights-stay',
  },
  {
    id: 'two-rakah-after-wudu',
    categoryId: 'sunnah-prayers',
    name: 'Two rakʿah after wuḍūʾ',
    detail: 'After completing wuḍūʾ, pray two rakʿah with full presence, before your mind wanders.',
    evidence: 'Bilāl prayed two rakʿah after every wuḍūʾ; the Prophet ﷺ heard his footsteps in Paradise (Bukhari 1149, Muslim 2458).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'water-drop',
  },
  {
    id: 'tahiyyat-al-masjid',
    categoryId: 'sunnah-prayers',
    name: 'Greet the masjid',
    detail: 'On entering the masjid, pray two rakʿah (taḥiyyat al-masjid) before you sit down.',
    evidence: 'When one of you enters the masjid, let him pray two rakʿah before sitting (Bukhari 444, Muslim 714).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'meeting-room',
  },
  {
    id: 'two-rakah-before-maghrib',
    categoryId: 'sunnah-prayers',
    name: 'Two rakʿah before Maghrib',
    detail: 'Between the Maghrib adhān and iqāmah, pray two light rakʿah.',
    evidence: '"Pray before Maghrib" — for whoever wishes; between every adhān and iqāmah is a prayer (Bukhari 1183, 627).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'brightness-3',
  },

  // ── Qur'an ───────────────────────────────────────────────────────────────
  {
    id: 'quran-daily-page',
    categoryId: 'quran',
    name: 'Read 1 page of Qurʾān',
    detail: 'Read at least one page of the Qurʾān today (set your own larger portion if you wish).',
    evidence: 'Read the Qurʾān, for it will intercede for its companions on the Day of Resurrection (Muslim 804).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'menu-book',
    essential: true,
  },
  {
    id: 'surah-al-mulk',
    categoryId: 'quran',
    name: 'Recite al-Mulk at night',
    detail: 'Recite Surah al-Mulk (chapter 67) before sleeping.',
    evidence: 'A sūrah of thirty verses interceded for its companion until he was forgiven — al-Mulk (Tirmidhi 2891, ḥasan).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'auto-stories',
  },
  {
    id: 'surah-al-kahf-friday',
    categoryId: 'quran',
    name: 'Recite al-Kahf on Friday',
    detail: 'Recite Surah al-Kahf (chapter 18) sometime on Friday (from Maghrib Thursday through Maghrib Friday).',
    evidence: 'Whoever reads Surah al-Kahf on Friday has light between the two Fridays (al-Ḥākim/al-Bayhaqī, ṣaḥīḥ).',
    defaultSchedule: [5],
    icon: 'import-contacts',
  },
  {
    id: 'baqarah-last-verses',
    categoryId: 'quran',
    name: 'Last two verses of al-Baqarah',
    detail: 'Recite the final two verses of Surah al-Baqarah (2:285–286) at night.',
    evidence: 'Whoever recites the last two verses of al-Baqarah at night, they suffice him (Bukhari 5009, Muslim 807).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'nightlight',
  },
  {
    id: 'three-quls-sleep',
    categoryId: 'quran',
    name: 'Three Quls before sleep',
    detail: 'Before sleeping, recite al-Ikhlāṣ, al-Falaq, and an-Nās — cup your hands, recite into them, and wipe over yourself three times.',
    evidence: 'Each night the Prophet ﷺ recited the Muʿawwidhāt into his hands and wiped over his body (Bukhari 5017).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'security',
  },
  {
    id: 'al-imran-last-ten',
    categoryId: 'quran',
    name: 'Last ten āyāt of Āl ʿImrān',
    detail: 'On rising in the night or for Fajr, recite the closing ten verses of Sūrat Āl ʿImrān (3:190–200).',
    evidence: 'On waking the Prophet ﷺ recited the last ten verses of Āl ʿImrān (Bukhari 4569, Muslim 763).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'auto-stories',
  },

  // ── Dhikr & remembrance ──────────────────────────────────────────────────
  {
    id: 'morning-adhkar',
    categoryId: 'dhikr',
    name: 'Morning adhkār',
    detail: 'Say the morning remembrances (Adhkār aṣ-Ṣabāḥ) after Fajr, before sunrise.',
    evidence: 'Glorify Him in the morning and the evening (Qurʾān 33:41–42).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'wb-sunny',
    essential: true,
  },
  {
    id: 'evening-adhkar',
    categoryId: 'dhikr',
    name: 'Evening adhkār',
    detail: 'Say the evening remembrances (Adhkār al-Masāʾ) between ʿAsr and Maghrib.',
    evidence: 'Glorify Him in the morning and the evening (Qurʾān 33:41–42).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'wb-twilight',
    essential: true,
  },
  {
    id: 'tasbih-after-salah',
    categoryId: 'dhikr',
    name: 'Tasbīḥ ×33 after each prayer',
    detail: 'After each obligatory prayer, say SubḥānAllāh, Alḥamdulillāh and Allāhu Akbar 33 times each, then complete the hundred with: lā ilāha illā Allāh waḥdahu lā sharīka lah, lahu-l-mulku wa lahu-l-ḥamd wa huwa ʿalā kulli shayʾin qadīr.',
    evidence: 'Whoever says them after every prayer, his sins are forgiven though they be like the foam of the sea (Muslim 597).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'repeat',
  },
  {
    id: 'ayat-al-kursi',
    categoryId: 'dhikr',
    name: 'Āyat al-Kursī after each prayer',
    detail: 'Recite Āyat al-Kursī (Qurʾān 2:255) after each obligatory prayer.',
    evidence: 'Whoever recites it after every prayer, nothing keeps him from Paradise but death (an-Nasāʾī, ṣaḥīḥ).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'shield',
  },
  {
    id: 'istighfar-100',
    categoryId: 'dhikr',
    name: 'Istighfār ×100',
    detail: "Seek Allah's forgiveness (astaghfirullāh) at least 100 times through the day.",
    evidence: 'I seek Allah’s forgiveness and repent to Him a hundred times a day (Muslim 2702).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'favorite',
  },
  {
    id: 'salawat',
    categoryId: 'dhikr',
    name: 'Salawāt ×10 on the Prophet ﷺ',
    detail: 'Send blessings on the Prophet ﷺ at least 10 times today — increase on Fridays.',
    evidence: 'Whoever sends one blessing on me, Allah sends ten upon him (Muslim 408).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'star',
  },
  {
    id: 'dua-on-waking',
    categoryId: 'dhikr',
    name: 'Duʿāʾ on waking',
    detail: 'On opening your eyes, say: Al-ḥamdu lillāhi alladhī aḥyānā baʿda mā amātanā wa ilayhi-n-nushūr.',
    evidence: 'On waking the Prophet ﷺ would say it — "Praise to Allah who gave us life after death, and to Him is the return" (Bukhari 6312).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'alarm',
    essential: true,
  },
  {
    id: 'answer-the-adhan',
    categoryId: 'dhikr',
    name: 'Answer the adhān',
    detail: "When you hear the call, repeat the muʾadhdhin's words, then ask Allah to grant the Prophet ﷺ al-wasīlah (Allāhumma rabba hādhihi-d-daʿwati-t-tāmmah…).",
    evidence: 'Repeat what the muʾadhdhin says (Bukhari 611); whoever asks al-wasīlah for me after it, my intercession is due for him (Bukhari 614).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'campaign',
    essential: true,
  },
  {
    id: 'dua-after-wudu',
    categoryId: 'dhikr',
    name: 'Duʿāʾ after wuḍūʾ',
    detail: 'After wuḍūʾ, say the shahādatayn: Ashhadu an lā ilāha illā Allāh waḥdahu lā sharīka lah, wa ashhadu anna Muḥammadan ʿabduhu wa rasūluh.',
    evidence: 'Whoever says it after wuḍūʾ, the eight gates of Paradise are opened for him (Muslim 234).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'opacity',
  },
  {
    id: 'dua-entering-masjid',
    categoryId: 'dhikr',
    name: 'Duʿāʾ entering & leaving the masjid',
    detail: 'Enter saying Allāhumma-ftaḥ lī abwāba raḥmatik; leave saying Allāhumma innī asʾaluka min faḍlik.',
    evidence: 'The Prophet ﷺ taught this on entering and leaving the masjid (Muslim 713).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'mosque',
  },
  {
    id: 'kaffarat-al-majlis',
    categoryId: 'dhikr',
    name: 'Seal a gathering',
    detail: 'Before leaving a sitting, say the expiation of the gathering (kaffārat al-majlis): Subḥānaka-llāhumma wa biḥamdik, ashhadu an lā ilāha illā ant, astaghfiruka wa atūbu ilayk.',
    evidence: 'Whoever says it when leaving a gathering, what occurred in it is forgiven (Tirmidhi 3433, ṣaḥīḥ).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'forum',
  },
  {
    id: 'restroom-dua',
    categoryId: 'dhikr',
    name: 'Duʿāʾ entering & leaving the restroom',
    detail: 'Enter saying Allāhumma innī aʿūdhu bika mina-l-khubthi wa-l-khabāʾith; leave saying Ghufrānak.',
    evidence: 'Entering — Bukhari 142, Muslim 375; leaving — Abu Dawud 30, Tirmidhi 7, ṣaḥīḥ.',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'wc',
  },

  // ── Fasting (Sunnah) ─────────────────────────────────────────────────────
  {
    id: 'fast-mon-thu',
    categoryId: 'fasting',
    name: 'Fast Monday & Thursday',
    detail: 'Fast from true dawn (Fajr) to sunset (Maghrib) on Mondays and Thursdays — no food, drink, or intimacy — having intended the fast beforehand.',
    evidence: 'Deeds are presented on Mondays and Thursdays, and I like mine presented while fasting (Tirmidhi 747, ḥasan; Muslim 1162).',
    defaultSchedule: [1, 4],
    icon: 'no-meals',
  },
  {
    id: 'fast-white-days',
    categoryId: 'fasting',
    name: 'Fast the White Days (13–15)',
    detail: 'Fast the three white days — the 13th, 14th, and 15th of each Hijri month — from dawn to sunset.',
    evidence: 'Fasting three days each month is like fasting for life; the Prophet ﷺ enjoined the white days, the 13th, 14th, and 15th (Bukhari 1979; Tirmidhi 761, ṣaḥīḥ).',
    defaultSchedule: [],
    hijriSchedule: { monthDays: [13, 14, 15] },
    icon: 'no-meals',
  },
  {
    id: 'fast-arafah',
    categoryId: 'fasting',
    name: 'Fast the Day of ʿArafah',
    detail: 'Fast the Day of ʿArafah — the 9th of Dhū al-Ḥijjah — for those not performing Hajj.',
    evidence: 'Fasting the Day of ʿArafah expiates the year before and the year after (Muslim 1162).',
    defaultSchedule: [],
    hijriSchedule: { dates: [{ month: 12, day: 9 }] },
    icon: 'no-meals',
  },
  {
    id: 'fast-ashura',
    categoryId: 'fasting',
    name: 'Fast ʿĀshūrāʾ (9–10 Muḥarram)',
    detail: 'Fast ʿĀshūrāʾ — the 10th of Muḥarram — together with the 9th (Tāsūʿāʾ), as the Prophet ﷺ resolved to do.',
    evidence: 'Fasting ʿĀshūrāʾ expiates the previous year; "if I live to next year I will fast the ninth" (Muslim 1134).',
    defaultSchedule: [],
    hijriSchedule: { dates: [{ month: 1, day: 9 }, { month: 1, day: 10 }] },
    icon: 'no-meals',
  },
  {
    id: 'fast-ramadan',
    categoryId: 'fasting',
    name: 'Fast Ramadan',
    detail: 'Fast every day of Ramadan from true dawn (Fajr) to sunset (Maghrib) — the obligatory fast of the month.',
    evidence: 'The month of Ramadan in which the Qurʾān was revealed … so whoever sights it, let him fast it (Qurʾān 2:185).',
    defaultSchedule: [],
    hijriSchedule: { months: [9] },
    icon: 'no-meals',
  },

  // ── Character & charity ──────────────────────────────────────────────────
  {
    id: 'sadaqah-daily',
    categoryId: 'character',
    name: 'Give sadaqah (even a smile)',
    detail: 'Give at least one charity today — money, a helpful act, or a smile to someone you meet.',
    evidence: 'Your smiling at your brother is charity (Tirmidhi 1956, ḥasan).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'volunteer-activism',
  },
  {
    id: 'good-word',
    categoryId: 'character',
    name: 'Say a good word',
    detail: 'Say at least one kind, truthful word to someone today.',
    evidence: 'A good word is charity (Bukhari 2989, Muslim 1009).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'chat-bubble-outline',
  },
  {
    id: 'ties-of-kinship',
    categoryId: 'character',
    name: 'Reach out to family',
    detail: 'Call, message, or visit at least one family member today — especially one you have drifted from.',
    evidence: 'Whoever wishes for a longer life, let him keep the ties of kinship (Bukhari 5986, Muslim 2557).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'people',
  },
  {
    id: 'miswak',
    categoryId: 'character',
    name: 'Use the miswāk / clean teeth',
    detail: 'Clean your teeth with the miswāk (or a brush) at least once today — ideally before a prayer or on waking.',
    evidence: 'Were it not a hardship, I would have ordered the siwāk at every prayer (Bukhari 887, Muslim 252).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'eco',
  },
  {
    id: 'sleep-on-wudu',
    categoryId: 'character',
    name: 'Sleep upon wudūʾ',
    detail: 'Make wudūʾ before getting into bed, then lie down on your right side.',
    evidence: 'When you go to bed, perform wudūʾ as for prayer, then lie on your right side (Bukhari 247).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'bedtime',
  },
  {
    id: 'sleeping-adhkar',
    categoryId: 'character',
    name: 'Sleeping adhkār',
    detail: 'As you lie down, say the sleeping duʿāʾ — at minimum: "Bismika Allāhumma amūtu wa aḥyā."',
    evidence: 'When the Prophet ﷺ went to bed he would say: "Bismika Allāhumma amūtu wa aḥyā" (Bukhari 6324).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'nightlight',
  },
  {
    id: 'name-allah-over-food',
    categoryId: 'character',
    name: 'Name & praise Allah over food',
    detail: 'Begin each meal with Bismillāh and end it with Alḥamdulillāh.',
    evidence: "Mention Allah's name when you eat (Abu Dawud 3767, Tirmidhi 1858, ḥasan ṣaḥīḥ); Allah is pleased with the servant who praises Him for his food (Muslim 2734).",
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'restaurant-menu',
  },
  {
    id: 'spread-salam',
    categoryId: 'character',
    name: 'Spread the salām',
    detail: "Greet fellow Muslims with as-salāmu ʿalaykum — those you know and those you don't.",
    evidence: 'Spread salām among you and you will love one another and enter Paradise (Muslim 54).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'waving-hand',
  },
  {
    id: 'dua-for-a-brother',
    categoryId: 'character',
    name: 'Duʿāʾ for someone in their absence',
    detail: "Make a sincere duʿāʾ, by name, for a fellow Muslim who isn't present.",
    evidence: 'The duʿāʾ of a Muslim for his absent brother is answered; an angel says: and for you the same (Muslim 2733).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'favorite-border',
  },
  {
    id: 'eat-together',
    categoryId: 'character',
    name: 'Share a meal with others',
    detail: 'Eat at least one meal today with family or others — from a shared plate where you can — rather than alone.',
    evidence: 'Eat together and not separately, for the blessing is in the company (Abu Dawud 3764, Ibn Mājah 3286, ḥasan).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'restaurant',
  },

  // ── Health & wellbeing (Sunnah guidance with strong modern evidence) ───────
  {
    id: 'qaylulah',
    categoryId: 'wellbeing',
    name: 'Take a short midday rest',
    detail: 'Rest or nap for 10–20 minutes around midday (qaylūlah) to restore energy for the day and for night prayer.',
    evidence: 'The Companions would take a midday rest (qaylūlah), a Prophetic practice (Bukhari 940).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'bed',
  },
  {
    id: 'moderate-eating',
    categoryId: 'wellbeing',
    name: 'Stop eating before you are full',
    detail: 'At your main meal, stop while still a little hungry — roughly a third for food, a third for drink, a third for breath.',
    evidence: 'The son of Ādam fills no vessel worse than his stomach (Tirmidhi 2380, ḥasan).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'restaurant',
  },
  {
    id: 'sleep-early',
    categoryId: 'wellbeing',
    name: 'Sleep early after ʿIshāʾ',
    detail: 'Be in bed within about an hour of ʿIshāʾ, skipping the idle late night, so you can rise easily for Fajr.',
    evidence: 'The Prophet ﷺ disliked sleeping before ʿIshāʾ and idle talk after it (Bukhari 568).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'dark-mode',
  },
  {
    id: 'daily-walk',
    categoryId: 'wellbeing',
    name: 'Walk every day',
    detail: 'Take a brisk walk of 10–30 minutes — make it your walk to the masjid wherever you can.',
    evidence: 'For every step toward the masjid a rank is raised and a sin erased (Muslim 666).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'directions-walk',
  },
  {
    id: 'hydrate-water',
    categoryId: 'wellbeing',
    name: 'Drink water through the day',
    detail: 'Stay hydrated — aim for 6–8 cups across the day, drinking seated and in a few breaths rather than one gulp.',
    evidence: 'The Prophet ﷺ would drink in three breaths and forbade gulping in one (Muslim 2028).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'local-drink',
  },
  {
    id: 'gratitude',
    categoryId: 'wellbeing',
    name: 'Count a blessing',
    detail: 'Pause once today to name one specific blessing and give thanks (shukr) to Allah for it (Alḥamdulillāh).',
    evidence: '"If you are grateful, I will surely increase you" (Qurʾān 14:7); whoever thanks not people thanks not Allah (Tirmidhi 1954, ṣaḥīḥ).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'sentiment-satisfied',
  },

  // ── Prophetic foods (Ibn al-Qayyim, aṭ-Ṭibb an-Nabawī) ────────────────────
  {
    id: 'black-seed-daily',
    categoryId: 'wellbeing',
    name: 'Take black seed',
    detail: 'Take a small daily amount of black seed (ḥabbat al-barakah / Nigella sativa) — about half a teaspoon of the seeds or oil, often taken with honey.',
    evidence: 'In the black seed is a remedy for every disease except death (Bukhari 5688, Muslim 2215).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'spa',
  },
  {
    id: 'dates-morning',
    categoryId: 'wellbeing',
    name: 'Eat dates in the morning',
    detail: 'Eat a few dates in the morning — the Sunnah is seven ʿAjwa dates on an empty stomach.',
    evidence: 'Whoever eats seven ʿAjwa dates in the morning, no poison or magic will harm him that day (Bukhari 5445, Muslim 2047).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'local-dining',
  },
  {
    id: 'honey-daily',
    categoryId: 'wellbeing',
    name: 'A spoon of honey',
    detail: 'Take a spoon of honey today — on its own or stirred into warm water.',
    evidence: 'In it is healing for people (Qurʾān 16:69); the Prophet ﷺ recommended honey for a stomach ailment (Bukhari 5684, Muslim 2217).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'emoji-food-beverage',
  },
  {
    id: 'olive-oil',
    categoryId: 'wellbeing',
    name: 'Use olive oil in your food',
    detail: 'Add olive oil to your food today — drizzle it over a meal or use it in cooking.',
    evidence: 'Eat olive oil and anoint yourselves with it, for it is from a blessed tree (Tirmidhi 1851, Ibn Mājah 3319, ḥasan).',
    defaultSchedule: DAILY_SCHEDULE,
    icon: 'water-drop',
  },
];

/** Short weekday names indexed 0=Sun … 6=Sat, for schedule summaries. */
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A human one-line schedule summary, e.g. "Every day", "Fri", "Mon, Thu", or — for a Hijri
 * habit — "White Days (13–15)", "Ramadan". Reminders are an opt-in choice the user makes per
 * habit, so they don't appear here.
 */
export function scheduleSummary(schedule: number[], hijri?: HijriSchedule | null): string {
  if (hijri) return describeHijriSchedule(hijri);
  const sorted = [...schedule].sort((a, b) => a - b);
  return sorted.length === 7 ? 'Every day' : sorted.map((d) => SHORT_WEEKDAYS[d]).join(', ') || 'No days';
}

/** The one-tap starter set — a balanced daily core for a brand-new user. */
export const ESSENTIAL_PRESETS = SUNNAH_PRESETS.filter((p) => p.essential);

/**
 * A curated "stack" — a natural sequence of Sunnah habits that belong together. Adding one
 * creates any missing member habits, then groups them in order (see `createStack`). Purely a
 * presentation grouping; each habit is still completed individually.
 */
export type SunnahRoutine = {
  /** Stable key. */
  id: string;
  /** The stored stack name. */
  name: string;
  /** One-line description shown in Discover. */
  detail: string;
  /** MaterialIcons glyph. */
  icon: keyof typeof MaterialIcons.glyphMap;
  /** Member preset ids, in sequence order. */
  presetIds: string[];
};

export const SUNNAH_ROUTINES: SunnahRoutine[] = [
  {
    id: 'fajr-routine',
    name: 'Fajr routine',
    detail: 'Anchor the dawn sequence to waking for Fajr: two rakʿah before Fajr, the Fajr prayer on time, then the morning adhkār.',
    icon: 'wb-twilight',
    presetIds: ['sunnah-before-fajr', 'fajr-on-time', 'morning-adhkar'],
  },
  {
    id: 'before-sleep-routine',
    name: 'Before sleep',
    detail: 'A Sunnah wind-down: evening adhkār, Witr, Surah al-Mulk, the three Quls, sleeping upon wuḍūʾ, then the sleeping duʿāʾ.',
    icon: 'bedtime',
    presetIds: ['evening-adhkar', 'witr', 'surah-al-mulk', 'three-quls-sleep', 'sleep-on-wudu', 'sleeping-adhkar'],
  },
  {
    id: 'waking-routine',
    name: 'On waking',
    detail: 'Start the day on the Sunnah: the duʿāʾ on waking, the last ten verses of Āl ʿImrān, then the miswāk.',
    icon: 'alarm',
    presetIds: ['dua-on-waking', 'al-imran-last-ten', 'miswak'],
  },
  {
    id: 'wudu-routine',
    name: 'After wuḍūʾ',
    detail: 'Seal each wuḍūʾ: the shahādatayn duʿāʾ, then two rakʿah before your mind wanders.',
    icon: 'opacity',
    presetIds: ['dua-after-wudu', 'two-rakah-after-wudu'],
  },
  {
    id: 'masjid-routine',
    name: 'At the masjid',
    detail: 'Arriving for congregation: answer the adhān, the masjid-entry duʿāʾ, greet the masjid with two rakʿah, then pray in congregation.',
    icon: 'mosque',
    presetIds: ['answer-the-adhan', 'dua-entering-masjid', 'tahiyyat-al-masjid', 'prayer-in-congregation'],
  },
  {
    id: 'gathering-routine',
    name: 'In a gathering',
    detail: 'The adab of sitting with people: spread the salām, offer a good word, then seal it with kaffārat al-majlis.',
    icon: 'forum',
    presetIds: ['spread-salam', 'good-word', 'kaffarat-al-majlis'],
  },
];

/** Resolve a routine's preset ids to its member presets, in sequence order. */
export function routinePresets(routine: SunnahRoutine): SunnahPreset[] {
  return routine.presetIds
    .map((id) => SUNNAH_PRESETS.find((p) => p.id === id))
    .filter((p): p is SunnahPreset => p != null);
}
