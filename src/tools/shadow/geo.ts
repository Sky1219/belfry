/** Spherical geometry for the circle of equal sun height. All angles in degrees, on a sphere. */

import type { LatLon } from "./solar";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const clamp1 = (x: number) => Math.min(1, Math.max(-1, x));
const mod = (x: number, m: number) => ((x % m) + m) % m;

/** Longitude folded into (-180, 180]. */
export function normalizeLon(lon: number): number {
  const w = mod(lon + 180, 360) - 180;
  return w === -180 ? 180 : w;
}

/** Great-circle distance by the haversine formula, in degrees of arc. */
export function angularDistanceDeg(a: LatLon, b: LatLon): number {
  const p1 = a.lat * RAD;
  const p2 = b.lat * RAD;
  const s1 = Math.sin((p2 - p1) / 2);
  const s2 = Math.sin(((b.lon - a.lon) * RAD) / 2);
  const h = s1 * s1 + Math.cos(p1) * Math.cos(p2) * s2 * s2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) * DEG;
}

/** The point reached by travelling distDeg of arc from `from` on an initial bearing (clockwise from north). */
export function destination(from: LatLon, bearingDeg: number, distDeg: number): LatLon {
  const phi = from.lat * RAD;
  const theta = bearingDeg * RAD;
  const d = distDeg * RAD;
  const lat = Math.asin(clamp1(Math.sin(phi) * Math.cos(d) + Math.cos(phi) * Math.sin(d) * Math.cos(theta)));
  const dLon = Math.atan2(Math.sin(theta) * Math.sin(d) * Math.cos(phi), Math.cos(d) - Math.sin(phi) * Math.sin(lat));
  return { lat: lat * DEG, lon: normalizeLon(from.lon + dLon * DEG) };
}

/** The bearing to set out on from `from` to reach `to`, clockwise from north in [0, 360). */
export function initialBearingDeg(from: LatLon, to: LatLon): number {
  const p1 = from.lat * RAD;
  const p2 = to.lat * RAD;
  const dLon = (to.lon - from.lon) * RAD;
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return mod(Math.atan2(y, x) * DEG, 360);
}

/** Every place that sees the sun at this zenith angle: a circle of radius zenithDeg about the subsolar point. */
export function locus(subsolar: LatLon, zenithDeg: number, n = 360): LatLon[] {
  return Array.from({ length: n }, (_, i) => destination(subsolar, (360 * i) / n, zenithDeg));
}

/** Longitudes at which the circle crosses a latitude: none, one (tangent) or two, each in (-180, 180]. */
export function locusAtLatitude(subsolar: LatLon, zenithDeg: number, lat: number): number[] {
  const phi = lat * RAD;
  const phiS = subsolar.lat * RAD;
  const denom = Math.cos(phi) * Math.cos(phiS);
  // At a pole every longitude is the same place (or, with the sun overhead there, all of them).
  if (Math.abs(denom) < 1e-12) return [];
  const c = (Math.cos(zenithDeg * RAD) - Math.sin(phi) * Math.sin(phiS)) / denom;
  const eps = 1e-9;
  if (c > 1 + eps || c < -1 - eps) return [];
  if (c >= 1 - eps) return [normalizeLon(subsolar.lon)];
  if (c <= -1 + eps) return [normalizeLon(subsolar.lon + 180)];
  const dLon = Math.acos(c) * DEG;
  return [normalizeLon(subsolar.lon - dLon), normalizeLon(subsolar.lon + dLon)];
}

/**
 * Every place on the circle from which the sun stands at this azimuth. Seen from a point on the
 * circle, the sun's azimuth is the bearing to the subsolar point, so walk the circle and find
 * where that bearing equals the measured one. The sun's height and azimuth fix a spherical
 * triangle by two sides and a non-included angle, so a large circle can be crossed twice: both
 * places are consistent with the photo. Empty when no point agrees to within a degree, or when the
 * circle is so small (zenith under 2 degrees) that the bearing to the subsolar point is ill-defined.
 */
export function fixesFromAzimuth(subsolar: LatLon, zenithDeg: number, sunAzimuthDeg: number): LatLon[] {
  if (!(zenithDeg >= 2)) return [];
  const target = mod(sunAzimuthDeg, 360);
  const samples = 3600;
  const step = 360 / samples;

  const pointAt = (theta: number) => destination(subsolar, theta, zenithDeg);
  // Signed difference, in [-180, 180), between the sun's azimuth from the circle point at
  // `theta` and the measured azimuth.
  const diffAt = (theta: number) => mod(initialBearingDeg(pointAt(theta), subsolar) - target + 180, 360) - 180;

  const f = Array.from({ length: samples + 1 }, (_, i) => diffAt(i * step));
  const found: LatLon[] = [];
  let best = 0;
  for (let i = 0; i < samples; i++) {
    if (Math.abs(f[i]) < Math.abs(f[best])) best = i;
    if (f[i] * f[i + 1] > 0) continue;
    // A sign change brackets a root, unless it is the azimuth wrapping at +-180 or flipping over a pole.
    let lo = i * step;
    let hi = lo + step;
    let sign = f[i];
    for (let k = 0; k < 30; k++) {
      const m = (lo + hi) / 2;
      const fm = diffAt(m);
      if (fm * sign > 0) {
        lo = m;
        sign = fm;
      } else hi = m;
    }
    const theta = (lo + hi) / 2;
    if (Math.abs(diffAt(theta)) > 0.01) continue;
    const p = pointAt(theta);
    if (!found.some((q) => angularDistanceDeg(p, q) < 1e-6)) found.push(p);
  }
  // The azimuth can touch the target without crossing it; accept a near miss.
  if (found.length === 0 && Math.abs(f[best]) <= 1) found.push(pointAt(best * step));
  return found;
}
