import { useCallback, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useRefreshLifecycle } from '@/hooks/use-refresh-lifecycle';
import { todayLocalISO } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

const CONSENT_VERSION = 1;

/** Explicit, revocable permission for quarter insights to process daily-note text. */
export function useAiNoteConsent() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayRef = useRef(todayLocalISO());

  const refresh = useCallback(async () => {
    if (!userId) return;
    todayRef.current = todayLocalISO();
    const { data, error: readError } = await supabase
      .from('users')
      .select('ai_notes_consent_at,ai_notes_consent_version')
      .eq('id', userId)
      .single();
    if (readError) {
      setError('Could not load this privacy setting.');
      return;
    }
    setEnabled(data.ai_notes_consent_at !== null && data.ai_notes_consent_version === CONSENT_VERSION);
    setError(null);
  }, [userId]);

  useRefreshLifecycle(userId, refresh, todayRef, setLoading);

  const update = useCallback(
    async (next: boolean) => {
      if (!userId || busy || next === enabled) return;
      const previous = enabled;
      setEnabled(next);
      setBusy(true);
      setError(null);
      const { error: updateError } = await supabase
        .from('users')
        .update({
          ai_notes_consent_at: next ? new Date().toISOString() : null,
          ai_notes_consent_version: next ? CONSENT_VERSION : null,
        })
        .eq('id', userId);
      if (updateError) {
        setEnabled(previous);
        setError('Could not update this privacy setting.');
      }
      setBusy(false);
    },
    [busy, enabled, userId],
  );

  const dismissError = useCallback(() => setError(null), []);
  return { enabled, loading, busy, error, dismissError, refresh, setEnabled: update };
}
