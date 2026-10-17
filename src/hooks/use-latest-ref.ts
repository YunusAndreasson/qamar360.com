import { useEffect, useRef, type RefObject } from 'react';

/**
 * Mirrors `value` into a ref after every render, so an async handler (a fetch callback, a
 * chained mutation) can read the latest value without a stale closure. The ref is sometimes
 * also written to directly between renders — e.g. right after an optimistic state update, so a
 * call chained immediately after sees it before the next render's effect would — which this
 * hook doesn't interfere with; it only owns the per-render mirror.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
