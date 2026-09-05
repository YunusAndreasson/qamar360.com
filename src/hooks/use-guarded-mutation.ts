import { useCallback } from 'react';

/**
 * Brackets a mutation's whole round-trip, so the fetches can tell whether one overlapped them.
 *
 * The optimistic-write generation alone only catches a SELECT that was ALREADY in flight when a
 * mutation landed. The opposite order is at least as common, and was unguarded: a sheet mutates,
 * closes on its own optimistic state, Today regains focus and fires its refresh — and only then do
 * the mutation's writes reach the server. That SELECT stamps the already-bumped generation, sees
 * no change, and applies rows the mutation had not been written into yet, undoing it on screen with
 * nothing left to correct it. Moves are hit hardest: renumbering positions sends one UPDATE per
 * displaced row against the refresh's single SELECT, so the refresh usually gets there first.
 *
 * So count the mutations whose writes are still open, and bump the generation again when one
 * settles. A fetch may apply its rows only if nothing was open when it started and nothing started
 * or settled while it ran — which together mean no mutation overlapped its SELECT at all.
 *
 * Nesting is fine (`createHabitInStack` is two of these in a row, `updateStack` can call
 * `deleteStack`): it is a count, not a flag.
 *
 * `begin`/`end` are supplied by the provider rather than the refs themselves: the React Compiler
 * only recognises a ref it can see come from `useRef`, and treats one passed in as a parameter as
 * an ordinary local that a callback must not write to.
 */
export function useGuardedMutation<A extends unknown[], R>(
  begin: () => void,
  end: () => void,
  run: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return useCallback(
    async (...args: A) => {
      begin();
      try {
        return await run(...args);
      } finally {
        end();
      }
    },
    [begin, end, run],
  );
}

