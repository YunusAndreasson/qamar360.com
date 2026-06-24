import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import type { Habit } from '@/hooks/use-habits';
import type { Tables } from '@/lib/database.types';
import {
  addDaysISO,
  hijriMonthRange,
  hijriParts,
  hijriYearStart,
  lastNDaysISO,
  scheduledOn,
  todayLocalISO,
} from '@/lib/dates';
import { supabase } from '@/lib/supabase';

/**
 * How far back we pull completions — covers the weekly view, the streak walk, and
 * this Hijri year so far (the life strip's current-year fill). The query returns
 * only rows that exist, so the payload scales with real usage, not the window.
 */
const WINDOW_DAYS = 370;
/** Days shown in the weekly bar chart and per-habit dot trail. */
const WEEK_DAYS = 7;

/** One day in a habit's recent history. */
export type DayCell = 'done' | 'missed' | 'inactive';

/** A single day's completion in the weekly bar chart. */
export type WeekDay = {
  iso: string;
  completed: number;
  possible: number;
  /** completed / possible, in [0, 1]; 0 when no habits were active that day. */
  fraction: number;
  isToday: boolean;
};

/** A habit's last-7-days consistency. */
export type HabitProgress = {
  id: string;
  name: string;
  /** 7 cells, oldest → today. */
  cells: DayCell[];
  /** Days completed within the window. */
  doneCount: number;
  /** Days the habit was scheduled within the window — the denominator for `doneCount`. */
  activeDays: number;
};

/** One day of the current Hijri month, for the "This month" bars. */
export type MonthDay = {
  /** Day of the Hijri month, 1-based. */
  day: number;
  /** completed / possible for that day, 0–1; 0 when nothing was scheduled. */
  fraction: number;
  /** 'past' = before today, 'today' = today, 'future' = not yet reached. */
  state: 'past' | 'today' | 'future';
};

/**
 * This Hijri month: its date (for the moon hero's lunar phase), its completion so far (the
 * overall %), and its day-by-day shape (the bars). `null` when the platform's `Intl` lacks
 * the Islamic calendar.
 */
export type MonthProgress = {
  /** Hijri month name, e.g. "Muharram". */
  monthName: string;
  /** Hijri year, e.g. 1448. */
  year: number;
  /** Today's day of the Hijri month, 1-based. */
  dayOfMonth: number;
  /** Days in this Hijri month (29 or 30). */
  monthLength: number;
  /** Scheduled acts completed so far this Hijri month. */
  thisDone: number;
  /** Scheduled acts so far this Hijri month (month-to-date) — the rate's denominator. */
  thisPossible: number;
  /** Every day of the month, 1 → last — the per-day bars (future days empty). */
  days: MonthDay[];
};

/** One Hijri month of the current year, for the "This year" bars. */
export type YearMonth = {
  /** 1-based Hijri month number (1 = Muharram … 12 = Dhul-Hijjah). */
  month: number;
  /** Hijri month name, e.g. "Rajab". */
  monthName: string;
  /** Completion rate, 0–1 — full month for the past, month-to-date for the current, 0 for the future. */
  fraction: number;
  /** 'past' = fully elapsed, 'current' = contains today, 'future' = not yet begun. */
  state: 'past' | 'current' | 'future';
};

/**
 * This Hijri year as its 12 months — the "year in moons" strip. `null` when the
 * Islamic calendar is unavailable.
 */
export type YearProgress = {
  /** Hijri year, e.g. 1448. */
  year: number;
  /** Muharram → Dhul-Hijjah, always length 12. */
  months: YearMonth[];
};

export type ProgressData = {
  /** True only during the first load. */
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  habitsCount: number;
  week: WeekDay[];
  totals: { completed: number; possible: number; percent: number };
  /** Per-habit last-7-days consistency, in the same order as the Habits tab. */
  perHabit: HabitProgress[];
  /** Consecutive "perfect" days (all active habits done) ending today/yesterday. */
  streak: number;
  /** True when the streak reached the `WINDOW_DAYS` edge still unbroken (so it may be longer). */
  streakCapped: boolean;
  /** This Hijri month's completion so far — the moon ring, or `null` if unavailable. */
  month: MonthProgress | null;
  /** This Hijri year as 12 months — the year bars, or `null` if unavailable. */
  year: YearProgress | null;
};

type CompletionRow = Pick<Tables<'habit_completions'>, 'habit_id' | 'completed_at'>;

/** Derive every progress metric from the raw rows. Pure — easy to reason about and test. */
function computeProgress(
  habits: Habit[],
  completions: CompletionRow[],
  today: string,
): Omit<ProgressData, 'loading' | 'error' | 'dismissError'> {
  // date → set of habit ids completed that day.
  const byDate = new Map<string, Set<string>>();
  for (const row of completions) {
    let set = byDate.get(row.completed_at);
    if (!set) {
      set = new Set();
      byDate.set(row.completed_at, set);
    }
    set.add(row.habit_id);
  }

  const weekDays = lastNDaysISO(WEEK_DAYS);

  // A day's completion fraction (done / scheduled), for the per-day month bars.
  const dayFraction = (iso: string): number => {
    const done = byDate.get(iso);
    let c = 0;
    let p = 0;
    for (const h of habits) {
      if (!scheduledOn(h, iso)) continue;
      p += 1;
      if (done?.has(h.id)) c += 1;
    }
    return p ? c / p : 0;
  };

  // Weekly bars + this-week totals.
  let totalCompleted = 0;
  let totalPossible = 0;
  const week: WeekDay[] = weekDays.map((iso) => {
    const done = byDate.get(iso);
    let completed = 0;
    let possible = 0;
    habits.forEach((h) => {
      if (!scheduledOn(h, iso)) return;
      possible += 1;
      if (done?.has(h.id)) completed += 1;
    });
    totalCompleted += completed;
    totalPossible += possible;
    return {
      iso,
      completed,
      possible,
      fraction: possible ? completed / possible : 0,
      isToday: iso === today,
    };
  });
  const totals = {
    completed: totalCompleted,
    possible: totalPossible,
    percent: totalPossible ? Math.round((100 * totalCompleted) / totalPossible) : 0,
  };

  // Per-habit consistency dots.
  const perHabit: HabitProgress[] = habits.map((h) => {
    const cells = weekDays.map<DayCell>((iso) => {
      if (!scheduledOn(h, iso)) return 'inactive';
      return byDate.get(iso)?.has(h.id) ? 'done' : 'missed';
    });
    let doneCount = 0;
    let activeDays = 0;
    for (const c of cells) {
      if (c !== 'inactive') activeDays += 1;
      if (c === 'done') doneCount += 1;
    }
    return { id: h.id, name: h.name, cells, doneCount, activeDays };
  });

  // Perfect-day streak: a day is "perfect" when at least one habit was scheduled and
  // every scheduled habit was completed. Days with nothing scheduled are rest days —
  // skipped so they neither break nor extend the streak. Walk back from today (or
  // yesterday, so a not-yet-finished today doesn't read as broken).
  const isPerfect = (iso: string): boolean => {
    const done = byDate.get(iso);
    let anyScheduled = false;
    for (const h of habits) {
      if (!scheduledOn(h, iso)) continue;
      anyScheduled = true;
      if (!done?.has(h.id)) return false;
    }
    return anyScheduled;
  };
  const isRestDay = (iso: string): boolean => !habits.some((h) => scheduledOn(h, iso));
  const earliest = addDaysISO(today, -(WINDOW_DAYS - 1));
  let cursor = isPerfect(today) ? today : addDaysISO(today, -1);
  let streak = 0;
  while (cursor >= earliest) {
    if (isRestDay(cursor)) {
      cursor = addDaysISO(cursor, -1); // rest day — skip without breaking
      continue;
    }
    if (!isPerfect(cursor)) break;
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
  // Counted all the way to the window edge while still perfect → the real streak may be longer.
  const streakCapped = streak > 0 && cursor < earliest;

  // This Hijri month vs last, as a completion *rate* (done / scheduled). A rate
  // normalises across changing habit counts and month lengths, so 100% always
  // means a perfect month regardless of how many acts that is. Reuses the same
  // `scheduledOn` denominator as the weekly stats above.
  const tallyRange = (startISO: string, endISO: string): { done: number; possible: number } => {
    let done = 0;
    let possible = 0;
    for (let day = startISO; day <= endISO; day = addDaysISO(day, 1)) {
      const got = byDate.get(day);
      for (const h of habits) {
        if (!scheduledOn(h, day)) continue;
        possible += 1;
        if (got?.has(h.id)) done += 1;
      }
    }
    return { done, possible };
  };
  let month: MonthProgress | null = null;
  const thisRange = hijriMonthRange(today);
  if (thisRange) {
    const here = tallyRange(thisRange.start, today); // month-to-date
    const days: MonthDay[] = [];
    for (let i = 0; i < thisRange.length; i += 1) {
      const iso = addDaysISO(thisRange.start, i);
      const state: MonthDay['state'] = iso < today ? 'past' : iso === today ? 'today' : 'future';
      days.push({ day: i + 1, fraction: state === 'future' ? 0 : dayFraction(iso), state });
    }
    month = {
      monthName: thisRange.monthName,
      year: thisRange.year,
      dayOfMonth: hijriParts(today)?.day ?? 1,
      monthLength: thisRange.length,
      thisDone: here.done,
      thisPossible: here.possible,
      days,
    };
  }

  // This Hijri year as its 12 months — Muharram → Dhul-Hijjah. Past months carry their
  // full rate, the current month its month-to-date rate, future months are empty (new
  // moons). Walks forward month by month from 1 Muharram using the same day arithmetic.
  let year: YearProgress | null = null;
  const yearStart = hijriYearStart(today);
  if (yearStart) {
    const months: YearMonth[] = [];
    let cursor = yearStart.start;
    for (let m = 1; m <= 12; m += 1) {
      const range = hijriMonthRange(cursor);
      if (!range) break;
      let state: YearMonth['state'];
      let tally = { done: 0, possible: 0 };
      if (range.start > today) {
        state = 'future';
      } else {
        tally = tallyRange(range.start, range.end <= today ? range.end : today);
        state = range.end <= today ? 'past' : 'current';
      }
      months.push({
        month: m,
        monthName: range.monthName,
        fraction: tally.possible ? tally.done / tally.possible : 0,
        state,
      });
      cursor = addDaysISO(range.end, 1); // the 1st of the next Hijri month
    }
    if (months.length === 12) year = { year: yearStart.year, months };
  }

  return { habitsCount: habits.length, week, totals, perHabit, streak, streakCapped, month, year };
}

/**
 * Read-only view of the user's recent habit history. Independent of
 * `HabitsProvider` (which lives only on the Habits tab and loads today alone):
 * this pulls a {@link WINDOW_DAYS}-day window and refetches whenever the Progress
 * tab regains focus, so ticks made elsewhere show up on return.
 */
export function useProgress(): ProgressData {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<string>(() => todayLocalISO());

  const todayRef = useRef(today);
  useEffect(() => {
    todayRef.current = today;
  }, [today]);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    const day = todayLocalISO();
    const since = addDaysISO(day, -(WINDOW_DAYS - 1));
    try {
      const [habitsRes, completionsRes] = await Promise.all([
        supabase.from('habits').select('*').eq('user_id', userId).order('position', { ascending: true }),
        supabase
          .from('habit_completions')
          .select('habit_id, completed_at')
          .eq('user_id', userId)
          .gte('completed_at', since),
      ]);
      if (habitsRes.error) throw habitsRes.error;
      if (completionsRes.error) throw completionsRes.error;
      setToday(day);
      setHabits(habitsRes.data ?? []);
      setCompletions(completionsRes.data ?? []);
      setError(null);
    } catch {
      setError('Could not load your progress. Reopen the tab to retry.');
    }
  }, [userId]);

  // Fetch on focus (covers the first mount too) so the view reflects ticks made
  // on the Habits tab when the user switches back here.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        await fetchData();
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [fetchData]),
  );

  // Day rollover while the tab stays focused in the background (focus won't fire).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !userId) return;
      if (todayLocalISO() !== todayRef.current) void fetchData();
    });
    return () => sub.remove();
  }, [userId, fetchData]);

  const dismissError = useCallback(() => setError(null), []);

  const derived = useMemo(() => computeProgress(habits, completions, today), [habits, completions, today]);

  return { loading, error, dismissError, ...derived };
}
