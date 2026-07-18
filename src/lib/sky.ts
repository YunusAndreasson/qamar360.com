/**
 * The observer's sky — where a star's fixed place in the heavens hangs above *you*, right now.
 *
 * The celestial companion to {@link moon.ts}: moon.ts draws the lunar month; this maps the
 * catalog (constants/stars.ts) into the local dome for a given place and instant. We lean on
 * `astronomy-engine` for the two fiddly, error-prone pieces — apparent sidereal time (Earth's
 * rotation angle, nutation-corrected) and the Moon's live position — and hand-roll the one hot
 * piece it can't scale to a whole catalogue: the equatorial→horizontal rotation, run once per
 * star. Star coordinates are J2000; precession to date is a fraction of a pixel over decades,
 * so we skip it. Everything here is pure and takes its inputs explicitly (no clock or locale
 * reads) so tests can pin a `date`, `lat`, and `lon`.
 */
import { Body, Equator, Horizon, Observer, SiderealTime } from 'astronomy-engine';

const DEG = Math.PI / 180;

/** Horizontal coordinates: `alt` above the horizon and `az` (0°=N, 90°=E), both in degrees. */
export type Horizontal = { alt: number; az: number };

/** Local apparent sidereal time in degrees (0..360) for an instant and longitude (east +). */
export function siderealTime(date: Date, lonDeg: number): number {
  const gastHours = SiderealTime(date); // Greenwich apparent sidereal time, in sidereal hours
  return (((gastHours * 15 + lonDeg) % 360) + 360) % 360;
}

/**
 * Equatorial (RA/Dec, degrees) → horizontal (alt/az, degrees) for an observer at latitude
 * `latDeg` whose local sidereal time is `lstDeg`. Standard spherical astronomy: hour angle
 * H = LST − RA, then rotate by the observer's latitude. Geometric — no atmospheric refraction
 * (irrelevant for a backdrop). Azimuth is measured from north, increasing through east, to
 * match `astronomy-engine`'s Horizon (so star and Moon share one frame).
 */
export function equatorialToHorizontal(raDeg: number, decDeg: number, latDeg: number, lstDeg: number): Horizontal {
  const H = (lstDeg - raDeg) * DEG; // hour angle, radians (positive to the west)
  const dec = decDeg * DEG;
  const lat = latDeg * DEG;
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(H);
  const alt = Math.asin(Math.min(1, Math.max(-1, sinAlt))) / DEG;
  const y = -Math.cos(dec) * Math.sin(H); // east component
  const x = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(H); // north component
  const az = ((Math.atan2(y, x) / DEG) % 360 + 360) % 360;
  return { alt, az };
}

/** The Moon's live horizontal position — for the moon-glow zone the stars steer clear of. */
export function moonHorizontal(date: Date, latDeg: number, lonDeg: number): Horizontal {
  return bodyHorizontal(Body.Moon, date, latDeg, lonDeg);
}

/** The Sun's live horizontal position — the day's arc over the observer ({@link sun.ts} turns
 *  its altitude into the daylight visuals and the day-part clock). */
export function sunHorizontal(date: Date, latDeg: number, lonDeg: number): Horizontal {
  return bodyHorizontal(Body.Sun, date, latDeg, lonDeg);
}

function bodyHorizontal(body: Body, date: Date, latDeg: number, lonDeg: number): Horizontal {
  const observer = new Observer(latDeg, lonDeg, 0);
  const eq = Equator(body, date, observer, true, true); // of-date, aberration-corrected
  const hor = Horizon(date, observer, eq.ra, eq.dec, 'normal');
  return { alt: hor.altitude, az: hor.azimuth };
}
