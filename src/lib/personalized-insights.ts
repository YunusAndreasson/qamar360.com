import type { Habit } from '@/hooks/use-habits';
import type { GoalReading } from '@/lib/goals';
import type { Reading } from '@/lib/insights';

export type PersonalizedInsight = {
  reading_id: string;
  paragraphs: [string, string, string];
  next_step: string;
  evidence: string | null;
  used_notes: boolean;
  generated_at: string;
};

/**
 * Metric-only mobile envelope. The Worker resolves names, evidence, consent, and notes itself.
 *
 * The goals ride along for the same reason the habits do: the reflection is written about a
 * quarter, and a quarter in which someone moved 300 lines toward a muṣḥaf is a different quarter
 * from one in which they kept the same acts with nothing behind them. Only the OPEN ones — a goal
 * set aside asks nothing of the month, and one already reached is not news.
 *
 * What is deliberately NOT sent: how many times the goal asked and was not answered. It is
 * derivable here and it is the one figure in this whole payload that a model would inevitably
 * turn into a reprimand, which every other line of this app's copy refuses to make.
 */
export function personalizedInsightRequest(
  reading: Reading,
  habits: Habit[],
  goals: GoalReading[],
  hijriOffset: -2 | -1 | 0 | 1 | 2,
) {
  const liveHabitIds = new Set(habits.map((habit) => habit.id));
  return {
    calendar: {
      hijriOffset,
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
    },
    reading: {
      id: reading.id,
      publishedISO: reading.publishedISO,
      span: {
        startISO: reading.span.startISO,
        endISO: reading.span.endISO,
        days: reading.span.days,
        milestone: reading.span.milestone,
      },
      quarter: {
        earned: reading.quarter.earned,
        possible: reading.quarter.possible,
        rate: reading.quarter.rate,
        sealedDays: reading.quarter.sealedDays,
        longestRunDays: reading.quarter.longestRun?.days ?? 0,
      },
      previous: reading.previous
        ? { earned: reading.previous.earned, possible: reading.previous.possible, rate: reading.previous.rate }
        : null,
      habits: [...reading.quarter.byHabit]
        .filter(([id]) => liveHabitIds.has(id))
        .map(([id, metric]) => ({ id, earned: metric.earned, possible: metric.possible })),
    },
    goals: goals
      .filter((goal) => goal.goal.status === 'open')
      .map((goal) => ({
        id: goal.goal.id,
        target: goal.goal.target_value,
        direction: goal.goal.direction,
        earned: goal.earned,
        remaining: goal.remaining,
        quota: goal.quota,
        quotaRemaining: goal.quotaRemaining,
        monthsLeft: goal.monthsLeft,
        pace: goal.pace,
        measured: goal.measured,
        met: goal.met,
        overdue: goal.overdue,
      })),
  };
}

export function parsePersonalizedInsight(value: unknown): PersonalizedInsight | null {
  if (!value || typeof value !== 'object') return null;
  const insight = (value as { insight?: unknown }).insight;
  if (!insight || typeof insight !== 'object') return null;
  const item = insight as Record<string, unknown>;
  if (!Array.isArray(item.paragraphs) || item.paragraphs.length !== 3) return null;
  if (!item.paragraphs.every((part) => typeof part === 'string' && part.trim().length > 0)) return null;
  if (typeof item.reading_id !== 'string' || typeof item.next_step !== 'string') return null;
  if (item.evidence !== null && typeof item.evidence !== 'string') return null;
  if (typeof item.used_notes !== 'boolean' || typeof item.generated_at !== 'string') return null;
  return item as PersonalizedInsight;
}
