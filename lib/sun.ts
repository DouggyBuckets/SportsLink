// Sunset for a date and place, accurate to a minute or two. The standard
// NOAA/SunCalc approximation; no network needed.

const rad = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;
const OBLIQUITY = rad * 23.4397;

const toDays = (date: Date) => date.getTime() / DAY_MS - 0.5 + J1970 - J2000;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);
const meanAnomaly = (d: number) => rad * (357.5291 + 0.98560028 * d);
const eclipticLongitude = (m: number) => m + rad * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m)) + rad * 102.9372 + Math.PI;
const approxTransit = (ht: number, lw: number, n: number) => J0 + (ht + lw) / (2 * Math.PI) + n;
const solarTransit = (ds: number, m: number, l: number) => J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);

export function sunset(date: Date, lat: number, lng: number): Date {
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const lw = rad * -lng;
  const phi = rad * lat;
  const n = Math.round(toDays(noon) - J0 - lw / (2 * Math.PI));
  const ds = approxTransit(0, lw, n);
  const m = meanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));
  // -0.833° = the sun's disc fully below the horizon, allowing for refraction.
  const w = Math.acos((Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  return fromJulian(solarTransit(approxTransit(w, lw, n), m, l));
}
