// Hijri CalVer — stamp the app version with today's Umm al-Qura (Hijri) date.
//
// The version IS the Hijri date the release shipped on: <year>.<month>.<day>, e.g. 1448.1.15
// (15 Muḥarram 1448 AH). That triple is also valid SemVer (major.minor.patch, with month ≤ 12 and
// day ≤ 30, no leading zeros), so npm / Expo / EAS / the App Store / Play all accept it unchanged
// — yet it reads as the lunar date that matters to this app (qamar = moon). Sorts correctly too:
// a later Hijri date is a higher version.
//
// Run:  npm run version:hijri   (rewrites the "version" field in package.json + app.json)
//
// Same Umm al-Qura source as src/lib/dates.ts. For multiple builds in one Hijri day, keep the
// store binary unique with the native build number (Android versionCode / iOS buildNumber) — the
// padded integer below, e.g. 14480115 — which EAS can also auto-increment.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { year: 'numeric', month: 'numeric', day: 'numeric' });
if (!fmt.resolvedOptions().calendar.startsWith('islamic')) {
  // Bail rather than silently stamp a Gregorian date on a runtime whose Intl lacks the calendar.
  console.error(`✗ This Node has no Umm al-Qura calendar (Intl resolved to '${fmt.resolvedOptions().calendar}'). Version unchanged.`);
  process.exit(1);
}

const parts = fmt.formatToParts(new Date());
const pick = (type) => Number(parts.find((p) => p.type === type)?.value);
const year = pick('year');
const month = pick('month');
const day = pick('day');
if (!year || !month || !day) {
  console.error('✗ Could not read the Hijri date. Version unchanged.');
  process.exit(1);
}

const version = `${year}.${month}.${day}`; // SemVer-valid: no leading zeros, month ≤ 12, day ≤ 30
const buildNumber = Number(`${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`);

for (const rel of ['package.json', 'app.json']) {
  const path = join(root, rel);
  const src = readFileSync(path, 'utf8');
  const next = src.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`);
  if (next === src) {
    console.error(`✗ No "version" field found in ${rel}. Aborting.`);
    process.exit(1);
  }
  writeFileSync(path, next);
}

console.log(`✓ Hijri version stamped: ${version}  (${day} / ${month} / ${year} AH)`);
console.log(`  package.json + app.json  version → ${version}`);
console.log(`  native build number (versionCode / buildNumber) → ${buildNumber}`);
