import 'expo-sqlite/localStorage/install';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  SUNNAH_CATEGORIES,
  SUNNAH_PRESETS,
  SUNNAH_ROUTINES,
  type SunnahCategory,
  type SunnahPreset,
  type SunnahRoutine,
} from '@/constants/sunnah-habits';
import type { Tables } from '@/lib/database.types';
import type { HijriSchedule } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

/**
 * The shared Sunnah catalog (categories, presets, routines) — the curated library shown in
 * Discover. It now lives in Supabase (public read-only tables) so the same content is served to
 * the mobile app and the web app. This provider fetches it once at launch and maps the DB rows
 * back to the exact shapes Discover already consumes, so nothing downstream had to change.
 *
 * Availability, not freshness, is the priority: the catalog changes rarely and a user must be
 * able to browse it offline. So we paint immediately from the last-good cache (or, on a first
 * run with no cache, the constants still bundled in the app), then revalidate from the network
 * in the background. `@/constants/sunnah-habits` therefore remains the offline fallback and the
 * seed source of truth during this migration.
 */

type Catalog = {
  categories: SunnahCategory[];
  presets: SunnahPreset[];
  routines: SunnahRoutine[];
};

type CatalogContextValue = Catalog & {
  /** The starter set — the `essential` presets, derived like the old `ESSENTIAL_PRESETS`. */
  essentialPresets: SunnahPreset[];
  /** Where the current data came from — bundled fallback, cache, or a fresh fetch. */
  source: 'bundled' | 'cache' | 'network';
};

const CACHE_KEY = 'catalog.v1';

/** The version compiled into the app — instant, always-available, the ultimate fallback. */
const BUNDLED: Catalog = {
  categories: SUNNAH_CATEGORIES,
  presets: SUNNAH_PRESETS,
  routines: SUNNAH_ROUTINES,
};

// The synchronous SQLite-backed Web Storage shim (same one the auth session and theme use),
// so the cached catalog is readable on the very first render without an async dependency.
type WebStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};
const storage = (globalThis as unknown as { localStorage?: WebStorageLike }).localStorage;

function readCache(): Catalog | null {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Catalog) : null;
  } catch {
    return null; // corrupt/unavailable cache — fall back to the bundled catalog
  }
}

function writeCache(catalog: Catalog): void {
  try {
    storage?.setItem(CACHE_KEY, JSON.stringify(catalog));
  } catch {
    // Best-effort cache; ignore quota/serialisation failures.
  }
}

function mapPreset(row: Tables<'presets'>): SunnahPreset {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    detail: row.detail,
    evidence: row.evidence,
    defaultSchedule: row.default_schedule,
    // The column is only ever written as a HijriSchedule; narrow it here (as use-habits does).
    hijriSchedule: (row.hijri_schedule as HijriSchedule | null) ?? undefined,
    targetCount: row.target_count ?? undefined,
    targetUnit: row.target_unit ?? undefined,
    essential: row.essential,
  };
}

type RoutineRow = Pick<Tables<'routines'>, 'id' | 'name' | 'detail'> & {
  routine_presets: Pick<Tables<'routine_presets'>, 'preset_id' | 'position'>[];
};

function mapRoutine(row: RoutineRow): SunnahRoutine {
  const members = [...row.routine_presets].sort((a, b) => a.position - b.position);
  return { id: row.id, name: row.name, detail: row.detail, presetIds: members.map((m) => m.preset_id) };
}

async function fetchCatalog(): Promise<Catalog> {
  const [categories, presets, routines] = await Promise.all([
    supabase.from('categories').select('id,title').order('sort_order'),
    supabase.from('presets').select('*').order('sort_order'),
    supabase.from('routines').select('id,name,detail,routine_presets(preset_id,position)').order('sort_order'),
  ]);
  if (categories.error) throw categories.error;
  if (presets.error) throw presets.error;
  if (routines.error) throw routines.error;
  return {
    categories: categories.data.map((c) => ({ id: c.id, title: c.title })),
    presets: presets.data.map(mapPreset),
    routines: routines.data.map(mapRoutine),
  };
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  // First paint from cache if we have it, else the bundled constants — never an empty catalog.
  const [state, setState] = useState<{ catalog: Catalog; source: CatalogContextValue['source'] }>(() => {
    const cached = readCache();
    return cached ? { catalog: cached, source: 'cache' } : { catalog: BUNDLED, source: 'bundled' };
  });

  useEffect(() => {
    let cancelled = false;
    fetchCatalog()
      .then((catalog) => {
        if (cancelled) return;
        writeCache(catalog);
        setState({ catalog, source: 'network' });
      })
      .catch(() => {
        // Offline / unreachable: keep whatever we already painted (cache or bundled).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<CatalogContextValue>(
    () => ({
      ...state.catalog,
      essentialPresets: state.catalog.presets.filter((p) => p.essential),
      source: state.source,
    }),
    [state],
  );

  return <CatalogContext value={value}>{children}</CatalogContext>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within a CatalogProvider');
  return ctx;
}
