/** Sun elevation from three marks on a photo, the photo's UTC time, and the finding that follows. */

import type { FindingDetail } from "../../store/schema";
import type { PhotoMetadata } from "../photo/metadata";
import { angularDistanceDeg, fixesFromAzimuth } from "./geo";
import { apparentToGeometric, subsolarPoint, type LatLon } from "./solar";

export interface Pt {
  x: number;
  y: number;
}

type Marks = { base: Pt; top: Pt; tip: Pt };

const DEG = 180 / Math.PI;
/** One degree of arc on the sphere, in metres. */
const METRES_PER_DEG = 111195;
/** Marks this close (5 px or less) are one click, not an object. */
const MIN_PX = 5;
const MIN_ELEVATION_DEG = 5;
/**
 * The root sum of squares of six +-pxSigma steps is a one-sigma figure: against marks moved by up to
 * 3 px it covered the true elevation only 90 to 94% of the time, too thin for a stated plus-or-minus.
 * Times 1.5 it covers 99% or more across the test scenes. (The place radius is propagated separately
 * and does not need it, but inherits it through the elevation band, at 13 to 30% wider radii.)
 */
const COVERAGE_FACTOR = 1.5;
/** How far a hand-typed shadow bearing may be off, in degrees; the place radius allows for it. */
export const BEARING_TOLERANCE_DEG = 2;
/** Below this zenith angle the sun's azimuth is too ill-defined to fix a place (geo's own limit). */
const MIN_ZENITH_DEG = 2;

const MSG_DEGENERATE = "Mark the object's base, its top and the tip of its shadow.";
const MSG_TOO_LOW = "The sun is too low for a reliable fix.";
const MSG_BEARING = "That bearing doesn't fit this sun height at that time.";
const MSG_OVERHEAD = "The sun was almost overhead, so its direction cannot fix a place.";
const MSG_TIME = "Enter the date and time the photo was taken.";
const LIMIT =
  "Assumes a vertical object on level ground, seen without strong perspective. Any place on this circle saw the sun at this height at that moment.";

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mod = (x: number, m: number) => ((x % m) + m) % m;

const elevationOf = (m: Marks) => Math.atan2(dist(m.top, m.base), dist(m.tip, m.base)) * DEG;

/**
 * The sun's apparent elevation from an upright object and its shadow: the angle whose tangent is
 * object length over shadow length. The uncertainty moves each of the six mark coordinates by
 * `pxSigma` in turn, keeps the larger elevation change of the two directions, and combines the six
 * as a root sum of squares, widened by COVERAGE_FACTOR. Refuses marks too close together to mean anything, and a sun under
 * 5 degrees (judged as displayed, to 1 dp) where refraction and flat ground make a fix unreliable.
 */
export function elevationFromMarks(
  m: Marks,
  pxSigma = 3,
): { elevationDeg: number; uncertaintyDeg: number } | { error: "too-low" | "degenerate"; message: string } {
  const finite = [m.base, m.top, m.tip].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!finite || dist(m.top, m.base) <= MIN_PX || dist(m.tip, m.base) <= MIN_PX) {
    return { error: "degenerate", message: MSG_DEGENERATE };
  }
  const elevationDeg = elevationOf(m);
  if (Math.round(elevationDeg * 10) / 10 < MIN_ELEVATION_DEG) return { error: "too-low", message: MSG_TOO_LOW };

  let sumSq = 0;
  for (const mark of ["base", "top", "tip"] as const) {
    for (const axis of ["x", "y"] as const) {
      const moved = (delta: number): Marks => ({ ...m, [mark]: { ...m[mark], [axis]: m[mark][axis] + delta } });
      const change = Math.max(
        Math.abs(elevationOf(moved(pxSigma)) - elevationDeg),
        Math.abs(elevationOf(moved(-pxSigma)) - elevationDeg),
      );
      sumSq += change * change;
    }
  }
  return { elevationDeg, uncertaintyDeg: COVERAGE_FACTOR * Math.sqrt(sumSq) };
}

/** An EXIF offset like "+05:30" in minutes east of UTC, or null if it isn't one. */
export function parseOffset(s: string): number | null {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hours = Number(m[2]);
  const minutes = Number(m[3]);
  if (hours > 14 || minutes > 59) return null;
  return (m[1] === "-" ? -1 : 1) * (hours * 60 + minutes);
}

/**
 * The instant the photo was taken, from its local EXIF time and UTC offset. Null when either is
 * missing or malformed: the same clock time is a different sun in every zone, so it never guesses.
 */
export function photoTimeUtc(meta: Pick<PhotoMetadata, "dateTimeOriginal" | "offsetTimeOriginal">): Date | null {
  if (!meta.dateTimeOriginal || !meta.offsetTimeOriginal) return null;
  const offset = parseOffset(meta.offsetTimeOriginal);
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(meta.dateTimeOriginal.trim());
  if (offset === null || !m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const local = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // Date.UTC rolls 13/40 over into a later date; a real clock reading survives the round trip.
  const same =
    local.getUTCFullYear() === y &&
    local.getUTCMonth() === mo - 1 &&
    local.getUTCDate() === d &&
    local.getUTCHours() === h &&
    local.getUTCMinutes() === mi &&
    local.getUTCSeconds() === s;
  return same ? new Date(local.getTime() - offset * 60000) : null;
}

/** A bearing folded into [0, 360). */
export function normalizeBearing(deg: number): number {
  return mod(deg, 360);
}

export interface ShadowFix {
  timeUtc: Date;
  /** Apparent elevation, as measured from the marks. */
  elevationDeg: number;
  uncertaintyDeg: number;
  subsolar: LatLon;
  /** Angular radius of the circle of equal sun height, from the geometric elevation. */
  zenithDeg: number;
  /** Places that fit the shadow's bearing as well: none without a bearing, otherwise one or two. */
  points: LatLon[];
  /**
   * Metres: the largest a place moves when the elevation is off by its uncertainty and the bearing
   * by BEARING_TOLERANCE_DEG. Null when there are no points.
   */
  radiusM: number | null;
}

/** Places that fit a zenith angle and sun azimuth, for an elevation (apparent) and shadow bearing. */
const placesFor = (subsolar: LatLon, apparentElevationDeg: number, shadowBearingDeg: number) =>
  fixesFromAzimuth(subsolar, 90 - apparentToGeometric(apparentElevationDeg), normalizeBearing(shadowBearingDeg) + 180);

/**
 * How far the answer can move. Re-solve at the elevation +/- its uncertainty and the bearing +/-
 * the tolerance (the corners and edge midpoints of that box) and take, for each fix, the distance
 * to the nearest re-solved place, largest over the box. The bearing pins the place along the circle,
 * so on a low sun a small error stretches into a long one; the elevation band alone understates it.
 */
function propagatedRadiusM(subsolar: LatLon, elevationDeg: number, uncertaintyDeg: number, bearingDeg: number, points: LatLon[]) {
  let worstDeg = 0;
  for (const de of [-1, 0, 1]) {
    for (const db of [-1, 0, 1]) {
      if (de === 0 && db === 0) continue;
      const moved = placesFor(subsolar, elevationDeg + de * uncertaintyDeg, bearingDeg + db * BEARING_TOLERANCE_DEG);
      if (moved.length === 0) continue;
      for (const p of points) worstDeg = Math.max(worstDeg, Math.min(...moved.map((q) => angularDistanceDeg(p, q))));
    }
  }
  return Math.round(worstDeg * METRES_PER_DEG);
}

/** Marks, photo time and optionally the shadow's compass bearing, resolved to a sun height and the places that fit it. */
export function solveShadow(input: { marks: Marks; timeUtc: Date; shadowBearingDeg?: number }): ShadowFix | { error: string } {
  if (!Number.isFinite(input.timeUtc.getTime())) return { error: MSG_TIME };
  const el = elevationFromMarks(input.marks);
  if ("error" in el) return { error: el.message };

  const subsolar = subsolarPoint(input.timeUtc);
  // The measured elevation is what the eye sees, refraction included; the geometry wants the true one.
  const zenithDeg = 90 - apparentToGeometric(el.elevationDeg);
  const fix: ShadowFix = { timeUtc: input.timeUtc, ...el, subsolar, zenithDeg, points: [], radiusM: null };
  const bearing = input.shadowBearingDeg;
  if (bearing === undefined) return fix;
  if (zenithDeg < MIN_ZENITH_DEG) return { error: MSG_OVERHEAD };

  // The shadow points away from the sun.
  const points = placesFor(subsolar, el.elevationDeg, bearing);
  if (points.length === 0) return { error: MSG_BEARING };
  return { ...fix, points, radiusM: propagatedRadiusM(subsolar, el.elevationDeg, el.uncertaintyDeg, bearing, points) };
}

const formatUtc = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
const formatPlace = (p: LatLon) =>
  `${Math.abs(p.lat).toFixed(1)}° ${p.lat >= 0 ? "N" : "S"}, ${Math.abs(p.lon).toFixed(1)}° ${p.lon >= 0 ? "E" : "W"}`;

/** The finding for a solved shadow: a place, two candidate places, or just the sun's height and its circle. */
export function shadowFinding(fix: ShadowFix): {
  title: string;
  body: string;
  detail: FindingDetail;
  meta: {
    sunLocus: { subsolarLat: number; subsolarLon: number; zenithDeg: number; bandDeg: number };
    points?: LatLon[];
  };
} {
  const sunLocus = {
    subsolarLat: fix.subsolar.lat,
    subsolarLon: fix.subsolar.lon,
    zenithDeg: fix.zenithDeg,
    bandDeg: fix.uncertaintyDeg,
  };
  // Round once; the title and the body quote the same strings.
  const height = `${fix.elevationDeg.toFixed(1)}° ± ${fix.uncertaintyDeg.toFixed(1)}°`;
  const when = formatUtc(fix.timeUtc);
  const elevation: FindingDetail = {
    kind: "measurement",
    value: fix.elevationDeg,
    unit: "° sun elevation",
    uncertainty: fix.uncertaintyDeg,
  };

  if (fix.points.length === 1) {
    const [p] = fix.points;
    const radiusM = fix.radiusM ?? 0;
    return {
      title: `Shadow fix: ${formatPlace(p)}`,
      body: `At ${when} the sun stood ${height} above the horizon. With the shadow's bearing that puts the photo at ${formatPlace(p)}, within about ${Math.round(radiusM / 1000)} km. That radius assumes the bearing is right to within ${BEARING_TOLERANCE_DEG}° and the camera clock is right. ${LIMIT}`,
      detail: { kind: "location", lat: p.lat, lon: p.lon, radiusM },
      meta: { sunLocus },
    };
  }
  if (fix.points.length > 1) {
    return {
      title: "Shadow fix: two possible places",
      body: `At ${when} the sun stood ${height} above the horizon. With the shadow's bearing the photo fits two places: ${fix.points.map(formatPlace).join(" and ")}. The sun stood at the same height and direction over both. ${LIMIT}`,
      detail: elevation,
      meta: { sunLocus, points: fix.points },
    };
  }
  return {
    title: `Sun elevation: ${height}`,
    body: `At ${when} the sun stood ${height} above the horizon. It was directly overhead at ${formatPlace(fix.subsolar)}, so the photo lies on a circle of radius ${Math.round((fix.zenithDeg * METRES_PER_DEG) / 1000)} km around that point, give or take ${Math.round((fix.uncertaintyDeg * METRES_PER_DEG) / 1000)} km. ${LIMIT}`,
    detail: elevation,
    meta: { sunLocus },
  };
}
