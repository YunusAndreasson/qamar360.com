import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TextEmbeddingsModule, models } from 'react-native-executorch';
import { ExpoResourceFetcher } from 'react-native-executorch-expo-resource-fetcher';

import { useAuth } from '@/hooks/use-auth';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { encodeVector } from '@/lib/embedding-vector';
import { chunkNoteBody, noteStamp } from '@/lib/note-chunks';
import { planEmbedWork, rankSemantic } from '@/lib/note-search';
import type { DailyNote } from '@/lib/notes';
import { readEmbedIndex, writeEmbedIndex, type EmbedIndex } from '@/lib/notes-embed-cache';
import { usePreference } from '@/lib/preferences';

/**
 * The model behind "search by meaning", and the sweep that keeps its index current.
 *
 * Everything about *what* to embed and *how* to score it lives in `lib/note-search.ts`,
 * `lib/note-chunks.ts` and `lib/embedding-vector.ts`, where jest can reach it. This file is
 * orchestration only: when the model is loaded, when it is freed, what order the work runs in, and
 * how a query in flight is kept from overtaking itself.
 *
 * ## Why the model is loaded here and not somewhere more convenient
 *
 * **Not on save.** `habits/note.tsx` mounts `useDictation`, which holds Moonshine's ~141 MB for as
 * long as the editor is open and calls itself the largest allocation this app ever makes. Putting a
 * ~140 MB embedder on that same screen is ~280 MB of models co-resident on the one screen where
 * memory is already at its peak, and a mid-range Android will kill the app for it.
 *
 * **Not in `use-notes.tsx`.** That provider sits at the `(tabs)` root, so a model owned by it is a
 * model held on the Habits tab, the Progress tab and every other screen in the app.
 *
 * **Here, gated on focus.** The Journal is a *pushed* screen: opening a note from it leaves it
 * mounted underneath. Mount is therefore the wrong signal and {@link useIsFocused} is the right one
 * — walking from a search result into the editor frees the embedder before the recogniser loads.
 *
 * ## Why the class and not `useTextEmbeddings`
 *
 * The hook loads on mount and downloads if the files are missing. Both are wrong here: the load
 * condition is a conjunction of three facts (preference on, screen focused, files already on disk),
 * and **this screen must never spend anyone's bandwidth** — the only place that may is the row in
 * Settings the user deliberately turned on. {@link TextEmbeddingsModule} gives a plain
 * `fromModelName` / `delete()` pair, which is the same shape `use-dictation.ts` already manages.
 */

/** Tuned for query→passage retrieval, 91 MB, 384 dimensions, and — unlike the multilingual
 *  alternatives, which cap at 126 tokens — it takes 509, so most notes embed in one piece. */
const MEANING_MODEL = models.text_embedding.multi_qa_minilm_l6_cos_v1();

/** What the download costs, quoted in Settings. The `.pte` and its tokeniser are fetched as-is —
 *  there is no archive to unpack — so unlike the voice model there is one number, not two. */
export const MEANING_MODEL_MB = 91;

/** The model's output width, and half of what makes a stored vector readable. See
 *  `notes-embed-cache.ts` for the other half. */
const MEANING_DIMS = 384;

/**
 * Bumped by hand whenever `chunkNoteBody` changes shape.
 *
 * The same body then yields different pieces, so every stored vector describes text the app no
 * longer produces. There is no migration — the header check discards the blob and the sweep rebuilds
 * from notes that are all still on the server.
 */
const CHUNKER_VERSION = 1;

/** Embeddings written before the screen gives up its slice of the work. Small enough that leaving
 *  mid-sweep loses almost nothing, large enough that a 456-chunk archive isn't 456 rewrites of a
 *  quarter-megabyte string. */
const FLUSH_EVERY = 25;

/** Below this a query carries no meaning worth a forward pass — the same line `note-vocabulary.ts`
 *  draws at `MIN_CURATED_LENGTH`, for the same reason. */
const MIN_QUERY_CHARS = 3;

/** Long enough that typing a word doesn't spend a forward pass per letter, short enough that the
 *  results arrive while you are still looking at the screen. Never applied to the lexical path. */
const QUERY_DEBOUNCE_MS = 250;

/** The two files the model needs. Exported for the Settings row, which downloads and deletes them
 *  without ever constructing a model. */
export function meaningModelSources(): string[] {
  return [MEANING_MODEL.modelSource, MEANING_MODEL.tokenizerSource];
}

/**
 * Are the model's files already on this phone?
 *
 * Resolves `false` on any failure rather than rejecting, so neither this screen nor Settings can be
 * taken down by a fetcher that cannot read its own directory — the same shape `voice-model-row.tsx`
 * uses for the recogniser.
 */
export async function isMeaningModelDownloaded(): Promise<boolean> {
  try {
    const present = await ExpoResourceFetcher.listDownloadedFiles();
    return meaningModelSources().every((source) => {
      const name = source.split('/').pop();
      return name !== undefined && name !== '' && present.some((file) => file.endsWith(name));
    });
  } catch {
    return false;
  }
}

/** What the Journal needs back. */
export type SemanticSearch = {
  /** Notes that cleared every gate in `rankSemantic`, by date. */
  hits: ReadonlyMap<string, number>;
  /** Non-null only while the background sweep still owes work, so the screen can say so. */
  progress: { done: number; total: number } | null;
  /**
   * Whether meaning actually took part in this search.
   *
   * Deliberately not "the preference is on": the preference can be on while the files have been
   * reclaimed by the OS, or while the model is still warming. The empty state reads this to decide
   * whether it may claim the app also looked for notes that *mean* the query — a claim that would
   * be false in both of those cases.
   */
  ready: boolean;
};

const NO_HITS: ReadonlyMap<string, number> = new Map<string, number>();

export function useSemanticSearch(
  query: string,
  archive: readonly DailyNote[],
  /** True once the archive on screen is a settled, successful read. Vectors for notes that are
   *  merely *absent from a failed load* must not be reaped — one offline launch would otherwise
   *  wipe the index. */
  settled: boolean,
): SemanticSearch {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const enabled = usePreference('searchByMeaning');
  const focused = useIsFocused();

  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState<EmbedIndex | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [queryVector, setQueryVector] = useState<{ text: string; vec: Float32Array } | null>(null);

  const moduleRef = useRef<TextEmbeddingsModule | null>(null);
  const indexRef = useLatestRef(index);
  const archiveRef = useLatestRef(archive);
  /** Bumped on every settled query so a stale forward pass can never publish over a newer one. */
  const seqRef = useRef(0);
  /** Held while a query is being embedded, so the sweep yields rather than making the user wait
   *  behind up to 450 chunks of background work. */
  const queryInFlight = useRef(false);

  const active = Boolean(enabled && focused && userId);

  // ── The model's life ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !userId) return;
    let disposed = false;

    void (async () => {
      // Never downloads. If Settings has not put the files here, the feature is simply off and the
      // Journal is the screen it has always been.
      if (!(await isMeaningModelDownloaded()) || disposed) return;

      try {
        const module = await TextEmbeddingsModule.fromModelName(MEANING_MODEL);
        if (disposed) {
          module.delete();
          return;
        }
        // The first forward pass builds the graph. Spending that on a throwaway string means the
        // user's first real query is not the slow one — the same trick `use-dictation.ts` plays
        // with `WARMUP_SAMPLES`.
        await module.forward('a quiet day');
        if (disposed) {
          module.delete();
          return;
        }
        moduleRef.current = module;
        setIndex(readEmbedIndex({ userId, model: MEANING_MODEL.modelName, dims: MEANING_DIMS, chunker: CHUNKER_VERSION }));
        setReady(true);
      } catch {
        // A model that will not load leaves the lexical search untouched, which is the whole
        // fallback. There is nothing to tell the user that they can act on.
      }
    })();

    return () => {
      disposed = true;
      moduleRef.current?.delete();
      moduleRef.current = null;
      setReady(false);
      setQueryVector(null);
      setProgress(null);
    };
  }, [active, userId]);

  // ── The sweep ────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !userId || !settled) return;
    let aborted = false;

    void (async () => {
      const header = { userId, model: MEANING_MODEL.modelName, dims: MEANING_DIMS, chunker: CHUNKER_VERSION };
      const current: EmbedIndex = indexRef.current ?? { ...header, notes: {} };
      const notes = { ...current.notes };

      const { queue, orphans } = planEmbedWork(archiveRef.current, { ...header, notes });
      for (const date of orphans) delete notes[date];

      let done = 0;
      let sinceFlush = orphans.length;
      const publish = () => {
        const next: EmbedIndex = { ...header, notes: { ...notes } };
        writeEmbedIndex(next);
        setIndex(next);
        sinceFlush = 0;
      };

      if (queue.length) setProgress({ done: 0, total: queue.length });

      for (const note of queue) {
        if (aborted) break;
        // A live query always wins: it is the thing somebody is waiting for.
        while (queryInFlight.current && !aborted) await new Promise((r) => setTimeout(r, 30));
        if (aborted) break;

        const module = moduleRef.current;
        if (!module) break;

        try {
          const chunks: string[] = [];
          for (const chunk of chunkNoteBody(note.body)) {
            if (aborted) break;
            chunks.push(encodeVector(await module.forward(chunk)));
          }
          if (aborted) break;
          notes[note.note_date] = { stamp: noteStamp(note.body), chunks };
          sinceFlush += 1;
        } catch {
          // One note that will not embed is one note the exact search still finds. Keep going.
        }

        done += 1;
        // Every tenth, not every one: 456 re-renders would be its own performance bug.
        if (done % 10 === 0) setProgress({ done, total: queue.length });
        if (sinceFlush >= FLUSH_EVERY) publish();
      }

      if (sinceFlush > 0) publish();
      if (!aborted) setProgress(null);
    })();

    return () => {
      aborted = true;
    };
  }, [ready, userId, settled, archive, indexRef, archiveRef]);

  // ── The query ────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const text = query.trim();
    // No clearing of the last vector here, and not only because React 19's lint refuses a
    // synchronous setState in an effect body: it would be redundant. The memo below already refuses
    // to rank a vector whose text is not the current query, so a leftover one is invisible — and
    // keeping it means backspacing a letter and retyping it costs no second forward pass.
    if (!ready || text.length < MIN_QUERY_CHARS) return;

    const seq = (seqRef.current += 1);
    const timer = setTimeout(() => {
      void (async () => {
        const module = moduleRef.current;
        if (!module) return;
        queryInFlight.current = true;
        try {
          const vec = await module.forward(text);
          // Guard one: a forward pass that finished after a newer one started never publishes.
          if (seq === seqRef.current) setQueryVector({ text, vec });
        } catch {
          // Leaves the previous vector in place; guard two below refuses to show it anyway.
        } finally {
          queryInFlight.current = false;
        }
      })();
    }, QUERY_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, ready]);

  const hits = useMemo(() => {
    // Guard two: even a stale vector that survived guard one cannot be *displayed* against the
    // wrong query. Also what makes the results grow for free as the sweep publishes — re-ranking
    // costs a dot product per chunk and no second forward pass.
    if (!queryVector || queryVector.text !== query.trim()) return NO_HITS;
    return rankSemantic(queryVector.vec, index);
  }, [queryVector, query, index]);

  return { hits, progress, ready };
}
