// Bright-star catalog generator — the real sky, distilled for a decorative backdrop.
//
// Source: the Yale Bright Star Catalog (BSC5), the classic ~9,100-star naked-eye catalogue,
// via brettonw/YaleBrightStarCatalog (bsc5-short.json). We keep only stars down to
// MAG_CUTOFF (the screen sky is a quiet backdrop, not a planetarium — fainter dust is
// filtered at render time anyway), convert sexagesimal RA/Dec to plain degrees, and carry
// each star's colour temperature so the renderer can warm-tint the genuinely cool (reddish)
// stars — Betelgeuse, Aldebaran, Arcturus — rather than picking warm anchors by rank.
//
// Emits src/constants/stars.ts (checked in). src/lib/starfield.ts projects these to the
// field for the observer's location + time; src/lib/sky.ts does the astronomy.
//
// Run:  npm run gen:stars   (rewrites src/constants/stars.ts)

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── TUNING ──────────────────────────────────────────────────────────────────────────────────
const SOURCE = 'https://raw.githubusercontent.com/brettonw/YaleBrightStarCatalog/master/bsc5-short.json';
/** Apparent-magnitude limit. 5.0 keeps ~1,600 stars — a well-populated window in any sky
 *  direction with headroom for the render-time count cap, without a bloated bundle. */
const MAG_CUTOFF = 5.0;
/** Coordinate precision: 3 decimal degrees ≈ 4 arcsec — far finer than a 1–2px dot needs. */
const COORD_DP = 3;
// ── END TUNING ──────────────────────────────────────────────────────────────────────────────

const RA_RE = /(\d+)h\s*(\d+)m\s*([\d.]+)s/; // "00h 05m 09.9s"  (hours, of RA)
const DEC_RE = /([+-])(\d+)°\s*(\d+)′\s*([\d.]+)″/; // "+45° 13′ 45″"

const roundTo = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;

/** "HHh MMm SS.Ss" → degrees (0..360). */
function parseRA(s) {
  const m = RA_RE.exec(s);
  if (!m) return null;
  const hours = +m[1] + +m[2] / 60 + +m[3] / 3600;
  return hours * 15;
}

/** "±DD° MM′ SS″" → degrees (−90..90). Sign is captured separately so −00° stays negative. */
function parseDec(s) {
  const m = DEC_RE.exec(s);
  if (!m) return null;
  const mag = +m[2] + +m[3] / 60 + +m[4] / 3600;
  return (m[1] === '-' ? -1 : 1) * mag;
}

const res = await fetch(SOURCE);
if (!res.ok) {
  console.error(`✗ fetch failed: ${res.status} ${res.statusText} — ${SOURCE}`);
  process.exit(1);
}
const raw = await res.json();

const stars = [];
for (const row of raw) {
  const mag = Number.parseFloat(row.V);
  if (!Number.isFinite(mag) || mag > MAG_CUTOFF) continue;
  const ra = parseRA(row.RA ?? '');
  const dec = parseDec(row.Dec ?? '');
  if (ra === null || dec === null) continue;
  const k = Number.parseInt(row.K ?? '', 10); // colour temperature (K); 0 = unknown
  stars.push({
    ra: roundTo(ra, COORD_DP),
    dec: roundTo(dec, COORD_DP),
    mag: roundTo(mag, 2),
    k: Number.isFinite(k) ? k : 0,
  });
}

// Brightest first — realSkyField takes a prefix when a rich region overflows the count cap.
stars.sort((a, b) => a.mag - b.mag);

const rows = stars.map((s) => `  { ra: ${s.ra}, dec: ${s.dec}, mag: ${s.mag}, k: ${s.k} },`).join('\n');
const file = `// GENERATED — do not hand-edit. Run \`npm run gen:stars\` (source: scripts/gen-stars.mjs).
//
// The Yale Bright Star Catalog (BSC5), naked-eye stars to magnitude ${MAG_CUTOFF}, brightest first.
// ra/dec are J2000 equatorial degrees; mag is apparent visual magnitude; k is colour
// temperature in Kelvin (0 = unknown). Consumed only by src/lib/starfield.ts (realSkyField).

/** One catalog star: J2000 right ascension + declination (degrees), apparent magnitude, and
 *  colour temperature in Kelvin (0 when the catalogue doesn't record it). */
export type CatalogStar = { ra: number; dec: number; mag: number; k: number };

export const STARS: readonly CatalogStar[] = [
${rows}
];
`;

const target = join(root, 'src', 'constants', 'stars.ts');
writeFileSync(target, file);
console.log(`✓ Stars generated → src/constants/stars.ts  (${stars.length} stars, mag ≤ ${MAG_CUTOFF})`);
