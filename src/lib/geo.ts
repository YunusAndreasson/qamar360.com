/**
 * Where the sky is drawn for — the observer's location, without ever asking permission.
 *
 * A habit tracker shouldn't prompt for GPS just to render a backdrop. The device timezone
 * already places the user within a zone's spread (Intl.DateTimeFormat is available in Hermes —
 * see {@link dates.ts}), which we map to the zone's representative city via the generated
 * {@link TZ_COORDS} table. On any miss (an unknown or exotic zone) we fall back to a neutral
 * default so the sky still renders a plausible night. A future "set your city" preference can
 * override this at the call site.
 */
import { TZ_COORDS } from '@/constants/tz-coords';

type GeoLocation = { lat: number; lon: number };

/** Fallback when the timezone is unknown or unmapped — Mecca: a fitting default for this app,
 *  and a mid-northern latitude that reads as a real night sky rather than the equator's. */
const FALLBACK: GeoLocation = { lat: 21.42, lon: 39.83 };

/** The device's IANA timezone, or null when the runtime can't report one. */
function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** The observer's approximate location from the device timezone; {@link FALLBACK} on any miss. */
export function deviceLocation(): GeoLocation {
  const zone = deviceTimeZone();
  const coords = zone ? TZ_COORDS[zone] : undefined;
  return coords ? { lat: coords[0], lon: coords[1] } : FALLBACK;
}
