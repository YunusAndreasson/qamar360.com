import { useCallback, useEffect, useState } from 'react';

import { Links } from '@/constants/links';
import { useAuth } from '@/hooks/use-auth';
import type { Habit } from '@/hooks/use-habits';
import type { GoalReading } from '@/lib/goals';
import type { Reading } from '@/lib/insights';
import {
  parsePersonalizedInsight,
  personalizedInsightRequest,
  type PersonalizedInsight,
} from '@/lib/personalized-insights';
import { usePreference } from '@/lib/preferences';

const API_ORIGIN = (process.env.EXPO_PUBLIC_API_URL ?? Links.website).replace(/\/$/, '');

export function usePersonalizedInsight(reading: Reading, habits: Habit[], goals: GoalReading[]) {
  const { session } = useAuth();
  const hijriOffset = usePreference('hijriOffset');
  const [insight, setInsight] = useState<PersonalizedInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!reading.closed || !session?.access_token) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_ORIGIN}/api/insights/${encodeURIComponent(reading.id)}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(personalizedInsightRequest(reading, habits, goals, hijriOffset)),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Insight request failed (${response.status})`);
        const parsed = parsePersonalizedInsight((await response.json()) as unknown);
        if (!parsed || parsed.reading_id !== reading.id) throw new Error('Invalid insight response');
        setInsight(parsed);
      } catch (caught) {
        if (caught instanceof Error && caught.name === 'AbortError') return;
        setError('The deeper reflection is unavailable right now.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [attempt, goals, habits, hijriOffset, reading, session?.access_token]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    insight,
    loading: reading.closed && Boolean(session?.access_token) && loading,
    error,
    retry,
  };
}
