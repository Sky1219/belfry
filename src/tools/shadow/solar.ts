/** Solar position by the NOAA solar calculator equations (Meeus-derived), all angles in degrees. */

export interface LatLon {
  lat: number;
  lon: number;
}

export interface SolarPosition {
  /** Apparent elevation: geometric elevation plus atmospheric refraction. */
  elevationDeg: number;
  geometricElevationDeg: number;
  /** Clockwise from true north, in [0, 360). */
  azimuthDeg: number;
  declinationDeg: number;
  /** Equation of time: apparent minus mean solar time, in minutes. */
  eqTimeMin: number;
}

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const clamp1 = (x: number) => Math.min(1, Math.max(-1, x));
const mod = (x: number, m: number) => ((x % m) + m) % m;

/** Longitude folded into (-180, 180]. */
function wrapLon(lon: number): number {
  const w = mod(lon + 180, 360) - 180;
  return w === -180 ? 180 : w;
}

/** Declination and equation of time for an instant (NOAA spreadsheet columns, Julian century onward). */
function sunParameters(date: Date): { declinationDeg: number; eqTimeMin: number } {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;

  const meanLong = mod(280.46646 + t * (36000.76983 + t * 0.0003032), 360);
  const meanAnom = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccent = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const m = meanAnom * RAD;
  const centre =
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289;
  const trueLong = meanLong + centre;
  const omega = (125.04 - 1934.136 * t) * RAD;
  const apparentLong = (trueLong - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;

  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliq = (meanObliq + 0.00256 * Math.cos(omega)) * RAD;
  const declinationDeg = Math.asin(clamp1(Math.sin(obliq) * Math.sin(apparentLong))) * DEG;

  const y = Math.tan(obliq / 2) ** 2;
  const l0 = meanLong * RAD;
  const eqTimeMin =
    4 *
    DEG *
    (y * Math.sin(2 * l0) -
      2 * eccent * Math.sin(m) +
      4 * eccent * y * Math.sin(m) * Math.cos(2 * l0) -
      0.5 * y * y * Math.sin(4 * l0) -
      1.25 * eccent * eccent * Math.sin(2 * m));
  return { declinationDeg, eqTimeMin };
}

/** Minutes since UTC midnight, seconds and milliseconds included. */
function utcMinutes(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60 + date.getUTCMilliseconds() / 60000;
}

/** NOAA's piecewise refraction correction, from the geometric elevation, in degrees. */
export function refractionDeg(geometricElevationDeg: number): number {
  const e = geometricElevationDeg;
  if (e > 85) return 0;
  const tan = Math.tan(e * RAD);
  let arcsec: number;
  if (e > 5) arcsec = 58.1 / tan - 0.07 / tan ** 3 + 0.000086 / tan ** 5;
  else if (e > -0.575) arcsec = 1735 + e * (-518.2 + e * (103.4 + e * (-12.79 + e * 0.711)));
  else arcsec = -20.774 / tan;
  return arcsec / 3600;
}

/** The geometric elevation whose refracted (apparent) elevation is the one given: the correction inverted by fixed-point iteration. */
export function apparentToGeometric(apparentDeg: number): number {
  let g = apparentDeg;
  for (let i = 0; i < 100; i++) {
    const next = apparentDeg - refractionDeg(g);
    if (Math.abs(next - g) < 1e-12) return next;
    g = next;
  }
  return g;
}

/** Where the sun stands for an observer at (lat, lon) at this instant. */
export function solarPosition(date: Date, lat: number, lon: number): SolarPosition {
  const { declinationDeg, eqTimeMin } = sunParameters(date);
  const decl = declinationDeg * RAD;
  const phi = lat * RAD;

  // True solar time in minutes, then the hour angle (0 at solar noon, positive in the afternoon).
  const trueSolarMin = mod(utcMinutes(date) + eqTimeMin + 4 * lon, 1440);
  const hourAngleDeg = trueSolarMin / 4 - 180;
  const ha = hourAngleDeg * RAD;

  const cosZenith = clamp1(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha));
  const zenith = Math.acos(cosZenith);
  const geometricElevationDeg = 90 - zenith * DEG;

  // Azimuth clockwise from north. Overhead or at a pole the denominator vanishes and
  // the azimuth is undefined; due south is as good as any.
  const denom = Math.cos(phi) * Math.sin(zenith);
  let azimuthDeg = 180;
  if (Math.abs(denom) > 1e-9) {
    const a = Math.acos(clamp1((Math.sin(phi) * cosZenith - Math.sin(decl)) / denom)) * DEG;
    azimuthDeg = hourAngleDeg > 0 ? mod(a + 180, 360) : mod(540 - a, 360);
  }

  return {
    elevationDeg: geometricElevationDeg + refractionDeg(geometricElevationDeg),
    geometricElevationDeg,
    azimuthDeg,
    declinationDeg,
    eqTimeMin,
  };
}

/** The place where the sun is directly overhead at this instant. */
export function subsolarPoint(date: Date): LatLon {
  const { declinationDeg, eqTimeMin } = sunParameters(date);
  return { lat: declinationDeg, lon: wrapLon(-15 * (utcMinutes(date) / 60 - 12 + eqTimeMin / 60)) };
}
