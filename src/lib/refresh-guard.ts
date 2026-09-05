/** Keep an optimistic write visible until a read can observe its settled server state.
 * Reads that overlap a write retry after all writes settle. Unlike discarding the result,
 * this also finishes loading a newly selected day whose state was cleared for the fetch.
 */
export function createRefreshGuard() {
  let generation = 0;
  let open = 0;
  const waiters = new Set<() => void>();
  return {
    begin() {
      open += 1;
      generation += 1;
    },
    end() {
      open -= 1;
      generation += 1;
      if (open === 0) {
        for (const resolve of waiters) resolve();
        waiters.clear();
      }
    },
    async read<R, T>(load: () => PromiseLike<R>, apply: (rows: R) => T, isCurrent: () => boolean): Promise<T | undefined> {
      let attempts = 0;
      while (isCurrent()) {
        if (open > 0) {
          await new Promise<void>((resolve) => waiters.add(resolve));
          continue;
        }
        if (attempts++ === 3) throw new Error('Refresh repeatedly superseded by writes');
        const started = generation;
        const rows = await load();
        if (!isCurrent()) return undefined;
        if (started !== generation) continue;
        // Validate and commit together: no async boundary where another write could begin.
        return apply(rows);
      }
      return undefined;
    },
  };
}
