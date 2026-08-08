import 'expo-sqlite/localStorage/install';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  SUNNAH_CATEGORIES,
  SUNNAH_PRESETS,
  type SunnahCategory,
  type SunnahPreset,
} from '@/constants/sunnah-habits';
import type { Tables } from '@/lib/database.types';
import type { HijriSchedule } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { getWebStorage } from '@/lib/web-storage';

/**
 * The shared Sunnah catalog (categories, presets) — the curated library shown in
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
};

// v2: the catalog dropped its prebuilt routines (stacks are made on Today by dragging), so the
// cached shape changed; the old v1 blob is simply orphaned.
const CACHE_KEY = 'catalog.v2';

/** The version compiled into the app — instant, always-available, the ultimate fallback. */
const BUNDLED: Catalog = {
  categories: SUNNAH_CATEGORIES,
  presets: SUNNAH_PRESETS,
};

const storage = getWebStorage();

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
  };
}

async function fetchCatalog(): Promise<Catalog> {
  const [categories, presets] = await Promise.all([
    supabase.from('categories').select('id,title').order('sort_order'),
    supabase.from('presets').select('*').order('sort_order'),
  ]);
  if (categories.error) throw categories.error;
  if (presets.error) throw presets.error;
  return {
    categories: categories.data.map((c) => ({ id: c.id, title: c.title })),
    presets: presets.data.map(mapPreset),
  };
}

type CatalogContextValue = Catalog & {
  /** Re-fetch from Supabase now (e.g. pull-to-refresh on Today). Silent: same swallow-and-keep
   * behavior as the mount fetch — a failure just leaves the previous catalog painted. */
  refresh: () => Promise<void>;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  // First paint from cache if we have it, else the bundled constants — never an empty catalog.
  const [catalog, setCatalog] = useState<Catalog>(() => readCache() ?? BUNDLED);

  useEffect(() => {
    let cancelled = false;
    fetchCatalog()
      .then((fresh) => {
        if (cancelled) return;
        writeCache(fresh);
        setCatalog(fresh);
      })
      .catch(() => {
        // Offline / unreachable: keep whatever we already painted (cache or bundled).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // On-demand re-fetch (e.g. pull-to-refresh on Today) — same swallow-and-keep behavior as the
  // mount fetch above. No `cancelled` guard: unlike the mount effect, this only ever runs while
  // the provider (mounted once at the root) is already up.
  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchCatalog();
      writeCache(fresh);
      setCatalog(fresh);
    } catch {
      // Offline / unreachable: keep whatever we already painted (cache or bundled).
    }
  }, []);

  const value = useMemo(() => ({ ...catalog, refresh }), [catalog, refresh]);

  return <CatalogContext value={value}>{children}</CatalogContext>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within a CatalogProvider');
  return ctx;
}
