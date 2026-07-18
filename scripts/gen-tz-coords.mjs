// IANA timezone → coordinates generator — the app's zero-permission location source.
//
// The night sky depends on *where* you are, but a habit tracker shouldn't ask for GPS just
// to draw a backdrop. The device timezone (Intl.DateTimeFormat().resolvedOptions().timeZone,
// which Hermes supports — see src/lib/dates.ts) already places the user to within a zone's
// spread — plenty for a decorative sky. This maps each IANA zone to its representative city's
// coordinates, straight from the tz database's own `zone1970.tab` (ISO 6709), and folds in the
// `backward` link aliases so legacy zone names (Asia/Calcutta, Europe/Kiev …) still resolve.
//
// Emits src/constants/tz-coords.ts (checked in), consumed by src/lib/geo.ts.
//
// Run:  npm run gen:tz-coords   (rewrites src/constants/tz-coords.ts)

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Primary coordinates come from the *pre-merge* 2021e release: in 2022 the tz database
// collapsed dozens of European zones into a few (Europe/Stockholm, /Oslo, /Amsterdam … became
// links to Europe/Berlin), which would place a Stockholm user 7° of latitude too far south.
// 2021e still lists each zone with its own city's coordinates. We then overlay the current
// release for genuinely new zones (Europe/Kyiv, America/Ciudad_Juarez …) and its `backward`
// links for legacy aliases.
const ZONE_TAB_PRIMARY = 'https://raw.githubusercontent.com/eggert/tz/2021e/zone1970.tab';
const ZONE_TAB_CURRENT = 'https://raw.githubusercontent.com/eggert/tz/main/zone1970.tab';
const BACKWARD = 'https://raw.githubusercontent.com/eggert/tz/main/backward';

/** ISO 6709 `±DDMM[SS]±DDDMM[SS]` → [lat, lon] in degrees. */
const ISO6709 = /^([+-])(\d{2})(\d{2})(\d{2})?([+-])(\d{3})(\d{2})(\d{2})?$/;
function parseCoords(s) {
  const m = ISO6709.exec(s);
  if (!m) return null;
  const lat = (m[1] === '-' ? -1 : 1) * (+m[2] + +m[3] / 60 + (+m[4] || 0) / 3600);
  const lon = (m[5] === '-' ? -1 : 1) * (+m[6] + +m[7] / 60 + (+m[8] || 0) / 3600);
  return [Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000];
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`✗ fetch failed: ${res.status} ${res.statusText} — ${url}`);
    process.exit(1);
  }
  return res.text();
}

const [primaryTab, currentTab, backward] = await Promise.all([
  fetchText(ZONE_TAB_PRIMARY),
  fetchText(ZONE_TAB_CURRENT),
  fetchText(BACKWARD),
]);

/** zone → [lat, lon]. Fill from `tab`, keeping any coordinates already set (primary wins). */
const coords = {};
function ingest(tab) {
  for (const line of tab.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [, isoCoords, zone] = line.split('\t');
    const parsed = parseCoords(isoCoords);
    if (parsed && zone && !coords[zone]) coords[zone] = parsed;
  }
}
ingest(primaryTab); // 2021e — real per-city coordinates
ingest(currentTab); // adds zones introduced after 2021e (Europe/Kyiv, America/Ciudad_Juarez …)

// Fold in aliases: each `Link TARGET LINKNAME` inherits the target's coordinates.
let aliases = 0;
for (const line of backward.split('\n')) {
  if (!line.startsWith('Link')) continue;
  const parts = line.split(/\s+/);
  const target = parts[1];
  const link = parts[2];
  if (target && link && coords[target] && !coords[link]) {
    coords[link] = coords[target];
    aliases++;
  }
}

const rows = Object.keys(coords)
  .sort()
  .map((z) => `  '${z}': [${coords[z][0]}, ${coords[z][1]}],`)
  .join('\n');

const file = `// GENERATED — do not hand-edit. Run \`npm run gen:tz-coords\` (source: scripts/gen-tz-coords.mjs).
//
// IANA timezone → [latitude, longitude] of the zone's representative city (tz database
// zone1970.tab, ISO 6709), plus backward-compatible zone aliases. Consumed by src/lib/geo.ts
// to place the observer for the real-sky backdrop without a location permission.

export const TZ_COORDS: Record<string, readonly [number, number]> = {
${rows}
};
`;

const target = join(root, 'src', 'constants', 'tz-coords.ts');
writeFileSync(target, file);
console.log(`✓ TZ coords generated → src/constants/tz-coords.ts  (${Object.keys(coords).length} zones, +${aliases} aliases)`);
