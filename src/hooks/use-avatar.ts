import { useCallback, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useRefreshLifecycle } from '@/hooks/use-refresh-lifecycle';
import { deletePhoto, pickPhoto, signedPhotoUrl, uploadPhoto } from '@/lib/avatar';
import { todayLocalISO } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

/** {@link useRefreshLifecycle} insists on somewhere to report the first read landing; this hook has
 *  no use for it (see the call site). Module-level so it is stable across renders. */
const IGNORE_LOADING = () => {};

/**
 * The user's photo, as the Settings screen needs it: a URL to draw, and the two verbs that change
 * it.
 *
 * Two screens hold one of these — the identity block and the sheet its avatar opens — and they
 * stay in step through the ordinary focus refetch {@link useRefreshLifecycle} already gives every
 * read-only hook in the app: the sheet writes, dismisses, and the screen behind it re-reads on
 * regaining focus. Nothing here is shared state, so nothing here can go stale in one place and
 * not the other.
 *
 * The signed URL is minted per `path`, not per read. A focus refetch that re-signed an unchanged
 * photo would hand `<Image>` a URL it had never seen and make it fetch the same bytes again; the
 * `signedFor` ref is what keeps a refetch free once the photo is on screen.
 *
 * @param seedPath What the caller already knows the key to be, if anything. The sheet is handed
 * the screen's answer this way, because its own read starts when it mounts and would otherwise be
 * racing the sheet's own presentation: for the first fraction of a second it would offer no
 * "Remove photo" row to a user who plainly has one, and `remove()` — which needs a key to delete —
 * would do nothing if pressed in that window. The read still runs and still wins; the seed only
 * means the sheet is never briefly wrong about a fact the screen behind it already had.
 */
export function useAvatar(seedPath: string | null = null) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [url, setUrl] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(seedPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayRef = useRef(todayLocalISO());
  /** The key the URL in state was signed for — see the note above. */
  const signedFor = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    todayRef.current = todayLocalISO();
    const { data, error: readError } = await supabase
      .from('users')
      .select('avatar_path')
      .eq('id', userId)
      .single();
    if (readError) {
      // Deliberately quiet: a photo that won't load is not worth a red line across a screen the
      // user opened to change something else, and the monogram is a complete fallback.
      return;
    }
    const next = data.avatar_path;
    setPath(next);
    if (!next) {
      signedFor.current = null;
      setUrl(null);
      return;
    }
    if (signedFor.current === next) return;
    signedFor.current = next;
    setUrl(await signedPhotoUrl(next));
  }, [userId]);

  // No loading gate. The monogram is not a spinner standing in for the photo, it is the other
  // complete answer — so there is nothing to withhold while the read is in flight, and Settings is
  // mounted eagerly with the rest of the tabs, which means the read has long since landed by the
  // time anyone looks at it.
  useRefreshLifecycle(userId, refresh, todayRef, IGNORE_LOADING);

  /** Point the row at a key and show it, minting the URL for the new object. */
  const adopt = useCallback(async (userIdValue: string, next: string | null) => {
    const { error: writeError } = await supabase
      .from('users')
      .update({ avatar_path: next })
      .eq('id', userIdValue);
    if (writeError) throw writeError;
    setPath(next);
    signedFor.current = next;
    setUrl(next ? await signedPhotoUrl(next) : null);
  }, []);

  /**
   * Pick a photo and make it the user's.
   *
   * Ordered so a failure is never worse than a no-op: the new object is uploaded first, the row is
   * moved onto it second, and only then is the old object deleted. Fail at step one and nothing
   * changed; fail at step two and the row still points at the photo that is still there.
   *
   * Resolves `true` when the photo changed, `false` when the user backed out of the picker — the
   * caller uses that to decide whether to dismiss.
   */
  const choose = useCallback(async (): Promise<boolean> => {
    if (!userId || busy) return false;
    setError(null);
    let photo;
    try {
      photo = await pickPhoto();
    } catch {
      setError('Could not open your photos.');
      return false;
    }
    if (!photo) return false;
    const previous = path;
    setBusy(true);
    try {
      const next = await uploadPhoto(userId, photo);
      await adopt(userId, next);
      if (previous && previous !== next) void deletePhoto(previous);
      return true;
    } catch {
      setError('Could not save your photo. Check your connection.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [adopt, busy, path, userId]);

  /** Drop the photo and go back to the monogram. The row is cleared before the object is deleted,
   *  for the same reason `choose` deletes last: a stranded object is recoverable, a row pointing
   *  at a deleted object is a screen that shows nothing and can't say why. */
  const remove = useCallback(async (): Promise<boolean> => {
    if (!userId || !path || busy) return false;
    setError(null);
    setBusy(true);
    try {
      const previous = path;
      await adopt(userId, null);
      void deletePhoto(previous);
      return true;
    } catch {
      setError('Could not remove your photo. Check your connection.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [adopt, busy, path, userId]);

  // `path` doubles as the image's cache key: it is stable for as long as the photo is, and it
  // outlives the signed URL — so a relaunch redraws from disk instead of re-fetching the bytes
  // behind a freshly minted URL the cache has never seen.
  return { url, path, busy, error, choose, remove };
}
