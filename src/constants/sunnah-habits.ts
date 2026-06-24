import { DAILY_SCHEDULE, formatReminderLabel } from '@/lib/dates';

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
 * Schedules use weekday indices 0=Sun … 6=Sat (matching `habits.schedule_days`). Reminder
 * times are sensible *placeholders* — prayer times vary by location/season, so each prayer's
 * `detail` tells the user to adjust it. Reminders only fire in a development build (not Expo
 * Go); the value is stored regardless.
 *
 * Hijri-date-only practices (the White Days, ʿĀshūrāʾ, ʿArafah) are intentionally omitted —
 * they can't be expressed as a weekday schedule, and an empty `schedule_days` would make a
 * habit invisible (see `scheduledOn`). They await a future Hijri-recurrence feature.
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
  /** Default weekday schedule (0=Sun … 6=Sat). Use `DAILY_SCHEDULE` for every day. */
  defaultSchedule: number[];
  /** Default reminder as `'HH:MM'` (24h), or null when there's no natural fixed time. */
  defaultReminder: string | null;
  /** MaterialIcons glyph (rendered on both platforms, matching `SettingsRow`). */
  icon: keyof typeof MaterialIcons.glyphMap;
  /** Part of the one-tap "starter set" — a balanced daily core for a new user. */
  essential?: boolean;
};

export const SUNNAH_CATEGORIES: SunnahCategory[] = [
  {
    id: 'salah',
    title: 'Daily prayers',
    footer: 'The five daily prayers are the foundation. Adjust each reminder to your local prayer time.',
  },
  { id: 'sunnah-prayers', title: 'Sunnah & nafl prayers' },
  { id: 'quran', title: "Qur'an" },
  { id: 'dhikr', title: 'Dhikr & remembrance' },
  {
    id: 'fasting',
    title: 'Fasting',
    footer: 'More fasting days (the White Days, ʿĀshūrāʾ, ʿArafah) are coming once Hijri-date scheduling lands.',
  },
  { id: 'character', title: 'Character & charity' },
];

export const SUNNAH_PRESETS: SunnahPreset[] = [
  // ── Daily prayers (salāh) ────────────────────────────────────────────────
  {
    id: 'fajr-on-time',
    categoryId: 'salah',
    name: 'Pray Fajr on time',
    detail: 'Pray the two obligatory rakʿahs of Fajr within its time, before sunrise. Adjust the reminder to your local Fajr time.',
    evidence: 'The best deed is prayer at its appointed time (Bukhari 527, Muslim 85).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: '05:00',
    icon: 'wb-twilight',
    essential: true,
  },
  {
    id: 'dhuhr-on-time',
    categoryId: 'salah',
    name: 'Pray Dhuhr on time',
    detail: 'Pray the four obligatory rakʿahs of Dhuhr within its time. Adjust the reminder to your local Dhuhr time.',
    evidence: 'The best deed is prayer at its appointed time (Bukhari 527, Muslim 85).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: '13:00',
    icon: 'light-mode',
    essential: true,
  },
  {
    id: 'asr-on-time',
    categoryId: 'salah',
    name: 'Pray Asr on time',
    detail: 'Pray the four obligatory rakʿahs of ʿAsr within its time. Adjust the reminder to your local ʿAsr time.',
    evidence: 'Whoever misses ʿAsr, it is as if he lost his family and wealth (Bukhari 552).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: '16:30',
    icon: 'wb-sunny',
    essential: true,
  },
  {
    id: 'maghrib-on-time',
    categoryId: 'salah',
    name: 'Pray Maghrib on time',
    detail: 'Pray the three obligatory rakʿahs of Maghrib within its time, after sunset. Adjust the reminder to your local Maghrib time.',
    evidence: 'The best deed is prayer at its appointed time (Bukhari 527, Muslim 85).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: '19:00',
    icon: 'brightness-4',
    essential: true,
  },
  {
    id: 'isha-on-time',
    categoryId: 'salah',
    name: 'Pray Isha on time',
    detail: 'Pray the four obligatory rakʿahs of ʿIshāʾ within its time. Adjust the reminder to your local ʿIshāʾ time.',
    evidence: 'The most burdensome prayers on the hypocrites are ʿIshāʾ and Fajr (Bukhari 657, Muslim 651).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: '20:30',
    icon: 'nightlight',
    essential: true,
  },
  {
    id: 'prayer-in-congregation',
    categoryId: 'salah',
    name: 'Pray in congregation',
    detail: 'Pray at least one of the daily prayers in congregation (at the masjid where you can).',
    evidence: 'Prayer in congregation is twenty-seven times superior to prayer alone (Bukhari 645, Muslim 650).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: null,
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
    defaultReminder: '04:45',
    icon: 'wb-twilight',
  },
  {
    id: 'rawatib-12',
    categoryId: 'sunnah-prayers',
    name: 'The 12 rawātib rakʿah',
    detail: 'Pray the twelve confirmed Sunnah rakʿahs across the day: 2 before Fajr, 4 before & 2 after Dhuhr, 2 after Maghrib, 2 after ʿIshāʾ.',
    evidence: 'Whoever prays twelve rakʿahs in a day and night, a house is built for him in Paradise (Muslim 728).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: null,
    icon: 'layers',
  },
  {
    id: 'witr',
    categoryId: 'sunnah-prayers',
    name: 'Pray Witr before sleeping',
    detail: 'Pray an odd number of rakʿahs (at least one) as Witr, making it the last prayer of your night.',
    evidence: 'Make Witr the last of your night prayer (Bukhari 998, Muslim 751).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: '22:00',
    icon: 'bedtime',
  },
  {
    id: 'duha',
    categoryId: 'sunnah-prayers',
    name: 'Pray Duhā (2 rakʿah)',
    detail: 'Pray at least two rakʿahs of Duhā after sunrise has fully risen and before Dhuhr.',
    evidence: 'Two rakʿahs of Duhā suffice as the charity due upon every joint each morning (Muslim 720).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: '09:30',
    icon: 'light-mode',
  },
  {
    id: 'tahajjud',
    categoryId: 'sunnah-prayers',
    name: 'Pray Tahajjud',
    detail: 'Pray at least two rakʿahs of night prayer (Qiyām al-Layl) after waking in the last part of the night.',
    evidence: 'The best prayer after the obligatory is the night prayer (Muslim 1163).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: null,
    icon: 'nights-stay',
  },

  // ── Qur'an ───────────────────────────────────────────────────────────────
  {
    id: 'quran-daily-page',
    categoryId: 'quran',
    name: 'Read 1 page of Qurʾān',
    detail: 'Read at least one page of the Qurʾān today (set your own larger portion if you wish).',
    evidence: 'Read the Qurʾān, for it will intercede for its companions on the Day of Resurrection (Muslim 804).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: null,
    icon: 'menu-book',
    essential: true,
  },
  {
    id: 'surah-al-mulk',
    categoryId: 'quran',
    name: 'Recite Surah al-Mulk at night',
    detail: 'Recite Surah al-Mulk (chapter 67) before sleeping.',
    evidence: 'A sūrah of thirty verses interceded for its companion until he was forgiven — al-Mulk (Tirmidhi 2891, ḥasan).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: '22:00',
    icon: 'auto-stories',
  },
  {
    id: 'surah-al-kahf-friday',
    categoryId: 'quran',
    name: 'Recite Surah al-Kahf on Friday',
    detail: 'Recite Surah al-Kahf (chapter 18) sometime on Friday (from Maghrib Thursday through Maghrib Friday).',
    evidence: 'Whoever reads Surah al-Kahf on Friday has light between the two Fridays (al-Ḥākim/al-Bayhaqī, ṣaḥīḥ).',
    defaultSchedule: [5],
    defaultReminder: '10:00',
    icon: 'import-contacts',
  },
  {
    id: 'baqarah-last-verses',
    categoryId: 'quran',
    name: 'Last two verses of al-Baqarah',
    detail: 'Recite the final two verses of Surah al-Baqarah (2:285–286) at night.',
    evidence: 'Whoever recites the last two verses of al-Baqarah at night, they suffice him (Bukhari 5009, Muslim 807).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: '22:00',
    icon: 'nightlight',
  },

  // ── Dhikr & remembrance ──────────────────────────────────────────────────
  {
    id: 'morning-adhkar',
    categoryId: 'dhikr',
    name: 'Morning adhkār',
    detail: 'Say the morning remembrances (Adhkār aṣ-Ṣabāḥ) after Fajr, before sunrise.',
    evidence: 'Glorify Him in the morning and the evening (Qurʾān 33:41–42).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: '06:30',
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
    defaultReminder: '18:00',
    icon: 'wb-twilight',
    essential: true,
  },
  {
    id: 'tasbih-after-salah',
    categoryId: 'dhikr',
    name: 'Tasbīḥ ×33 after each prayer',
    detail: 'After each obligatory prayer, say SubḥānAllāh, Alḥamdulillāh, and Allāhu Akbar 33 times each.',
    evidence: 'Whoever says them after every prayer, his sins are forgiven though they be like the foam of the sea (Muslim 597).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: null,
    icon: 'repeat',
  },
  {
    id: 'ayat-al-kursi',
    categoryId: 'dhikr',
    name: 'Āyat al-Kursī after each prayer',
    detail: 'Recite Āyat al-Kursī (Qurʾān 2:255) after each obligatory prayer.',
    evidence: 'Whoever recites it after every prayer, nothing keeps him from Paradise but death (an-Nasāʾī, ṣaḥīḥ).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: null,
    icon: 'shield',
  },
  {
    id: 'istighfar-100',
    categoryId: 'dhikr',
    name: 'Istighfār ×100',
    detail: "Seek Allah's forgiveness (astaghfirullāh) at least 100 times through the day.",
    evidence: 'I seek Allah’s forgiveness and repent to Him a hundred times a day (Muslim 2702).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: null,
    icon: 'favorite',
  },
  {
    id: 'salawat',
    categoryId: 'dhikr',
    name: 'Send salawāt on the Prophet ﷺ',
    detail: 'Send blessings on the Prophet ﷺ during the day; increase on Fridays.',
    evidence: 'Whoever sends one blessing on me, Allah sends ten upon him (Muslim 408).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: null,
    icon: 'star',
  },

  // ── Fasting (Sunnah) ─────────────────────────────────────────────────────
  {
    id: 'fast-mon-thu',
    categoryId: 'fasting',
    name: 'Fast Monday & Thursday',
    detail: 'Fast from dawn (Fajr) to sunset (Maghrib) on Mondays and Thursdays.',
    evidence: 'Deeds are presented on Mondays and Thursdays, and I like mine presented while fasting (Tirmidhi 747, ḥasan; Muslim 1162).',
    defaultSchedule: [1, 4],
    defaultReminder: null,
    icon: 'no-meals',
  },

  // ── Character & charity ──────────────────────────────────────────────────
  {
    id: 'sadaqah-daily',
    categoryId: 'character',
    name: 'Give sadaqah (even a smile)',
    detail: 'Give something in charity today — money, help, or even a smile to your brother.',
    evidence: 'Your smiling at your brother is charity (Tirmidhi 1956, ḥasan).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: null,
    icon: 'volunteer-activism',
  },
  {
    id: 'good-word',
    categoryId: 'character',
    name: 'Say a good word',
    detail: 'Speak a kind, truthful word to someone today, or stay silent from harm.',
    evidence: 'A good word is charity (Bukhari 2989, Muslim 1009).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: null,
    icon: 'chat-bubble-outline',
  },
  {
    id: 'ties-of-kinship',
    categoryId: 'character',
    name: 'Reach out to family',
    detail: 'Maintain ties of kinship — call or visit a family member, especially one you have drifted from.',
    evidence: 'Whoever wishes for a longer life, let him keep the ties of kinship (Bukhari 5986, Muslim 2557).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: null,
    icon: 'people',
  },
  {
    id: 'miswak',
    categoryId: 'character',
    name: 'Use the miswāk / clean teeth',
    detail: 'Clean your teeth with the miswāk (or a brush), especially before prayer and on waking.',
    evidence: 'Were it not a hardship, I would have ordered the siwāk at every prayer (Bukhari 887, Muslim 252).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: null,
    icon: 'eco',
  },
  {
    id: 'sleep-on-wudu',
    categoryId: 'character',
    name: 'Sleep upon wudūʾ with adhkār',
    detail: 'Make wudūʾ before bed and say the sleeping remembrances as you lie down.',
    evidence: 'When you go to bed, perform wudūʾ as for prayer, then lie on your right side (Bukhari 247).',
    defaultSchedule: DAILY_SCHEDULE,
    defaultReminder: '22:00',
    icon: 'bedtime',
  },
];

/** Short weekday names indexed 0=Sun … 6=Sat, for schedule summaries. */
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A human one-line schedule summary, e.g. "Every day · 5:00 AM", "Fri · 10:00 AM",
 * "Mon, Thu". Reuses {@link formatReminderLabel} so times read in the user's locale.
 */
export function scheduleSummary(schedule: number[], reminder: string | null): string {
  const sorted = [...schedule].sort((a, b) => a - b);
  const base =
    sorted.length === 7 ? 'Every day' : sorted.map((d) => SHORT_WEEKDAYS[d]).join(', ') || 'No days';
  const time = reminder ? formatReminderLabel(reminder) : '';
  return time ? `${base} · ${time}` : base;
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
    detail: 'The dawn sequence — two rakʿah before Fajr, the Fajr prayer on time, then the morning adhkār.',
    icon: 'wb-twilight',
    presetIds: ['sunnah-before-fajr', 'fajr-on-time', 'morning-adhkar'],
  },
  {
    id: 'before-sleep-routine',
    name: 'Before sleep',
    detail: 'Wind down on the Sunnah — evening adhkār, Witr, Surah al-Mulk, and sleeping upon wuḍūʾ.',
    icon: 'bedtime',
    presetIds: ['evening-adhkar', 'witr', 'surah-al-mulk', 'sleep-on-wudu'],
  },
];

/** Resolve a routine's preset ids to its member presets, in sequence order. */
export function routinePresets(routine: SunnahRoutine): SunnahPreset[] {
  return routine.presetIds
    .map((id) => SUNNAH_PRESETS.find((p) => p.id === id))
    .filter((p): p is SunnahPreset => p != null);
}
