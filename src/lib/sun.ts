const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const ZENITH = 90.833;

export type Coordinates = { latitude: number; longitude: number };
export type Daylight = { sunrise: Date; solarNoon: Date; sunset: Date };

function dayOfYear(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function sunTime(date: Date, coordinates: Coordinates, rising: boolean) {
  const n = dayOfYear(date);
  const lngHour = coordinates.longitude / 15;
  const t = n + ((rising ? 6 : 18) - lngHour) / 24;
  const meanAnomaly = 0.9856 * t - 3.289;
  let trueLongitude =
    meanAnomaly + 1.916 * Math.sin(meanAnomaly * DEG) + 0.02 * Math.sin(2 * meanAnomaly * DEG) + 282.634;
  trueLongitude = normalizeDegrees(trueLongitude);

  let rightAscension = Math.atan(0.91764 * Math.tan(trueLongitude * DEG)) * RAD;
  rightAscension = normalizeDegrees(rightAscension);
  rightAscension += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscension / 90) * 90;
  rightAscension /= 15;

  const sinDeclination = 0.39782 * Math.sin(trueLongitude * DEG);
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const cosHour =
    (Math.cos(ZENITH * DEG) - sinDeclination * Math.sin(coordinates.latitude * DEG)) /
    (cosDeclination * Math.cos(coordinates.latitude * DEG));

  if (cosHour > 1 || cosHour < -1) return null;

  let hour = rising ? 360 - Math.acos(cosHour) * RAD : Math.acos(cosHour) * RAD;
  hour /= 15;

  const localMeanTime = hour + rightAscension - 0.06571 * t - 6.622;
  const utcHour = (localMeanTime - lngHour + 24) % 24;
  const out = new Date(date);
  out.setUTCHours(0, 0, 0, 0);
  out.setUTCMinutes(Math.round(utcHour * 60));
  return out;
}

export function getDaylight(date: Date, coordinates: Coordinates): Daylight | null {
  const sunrise = sunTime(date, coordinates, true);
  const sunset = sunTime(date, coordinates, false);
  if (!sunrise || !sunset) return null;

  return {
    sunrise,
    sunset,
    solarNoon: new Date((sunrise.getTime() + sunset.getTime()) / 2),
  };
}

export function daylightFraction(now: Date, daylight: Daylight | null) {
  if (!daylight) return 0.5;

  const start = daylight.sunrise.getTime();
  const end = daylight.sunset.getTime();
  if (now.getTime() <= start) return 0;
  if (now.getTime() >= end) return 1;
  return (now.getTime() - start) / (end - start);
}
