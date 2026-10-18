import { useCallback, useEffect, useRef, useState } from 'react';

import { useLatestRef } from '@/hooks/use-latest-ref';
import { useRefreshLifecycle } from '@/hooks/use-refresh-lifecycle';
import { todayLocalISO } from '@/lib/dates';

/** Read-only history shared by Progress and Stats. Callers supply a stable loader and an
 * identity covering the user and query scope. Refresh errors keep the last successful data;
 * concurrent refreshes share a request, and superseded or unmounted reads cannot publish. */
export function useHistoryRead<T>(
  userId: string | null,
  identity: string,
  load: (userId: string, today: string) => Promise<T>,
  initialData: T,
  errorMessage: string,
) {
  const [snapshot, setSnapshot] = useState(() => ({ data: initialData, today: todayLocalISO() }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const todayRef = useLatestRef(snapshot.today);
  const inFlight = useRef<{ identity: string; work: Promise<void> } | null>(null);

  // Invalidate by request, rather than just its key: switching A → B → A must not let the
  // original A request publish into (or clear the pending request of) the new A screen.
  useEffect(() => {
    return () => { inFlight.current = null; };
  }, [identity]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    if (inFlight.current?.identity === identity) return inFlight.current.work;
    const today = todayLocalISO();
    // Defer the loader so even a synchronous throw happens after the request is registered.
    const work: Promise<void> = Promise.resolve().then(async () => {
      try {
        const data = await load(userId, today);
        if (inFlight.current?.work !== work) return;
        setSnapshot({ data, today });
        setError(null);
      } catch {
        if (inFlight.current?.work !== work) return;
        setError(errorMessage);
      } finally {
        if (inFlight.current?.work === work) inFlight.current = null;
      }
    });
    inFlight.current = { identity, work };
    return work;
  }, [userId, identity, load, errorMessage]);

  useRefreshLifecycle(userId, refresh, todayRef, setLoading);
  const dismissError = useCallback(() => setError(null), []);

  return { ...snapshot, loading, error, dismissError, refresh };
}
