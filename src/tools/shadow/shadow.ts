/** Sun elevation from three marks on a photo, the photo's UTC time, and the finding that follows. */

import type { FindingDetail } from "../../store/schema";
import type { PhotoMetadata } from "../photo/metadata";
import { angularDistanceDeg, fixesFromAzimuth } from "./geo";
import { apparentToGeometric, subsolarPoint, type LatLon } from "./solar";

export interface Pt {
  x: number;
  y: number;
}

export type Marks = { base: Pt; top: Pt; tip: Pt };

const DEG = 180 / Math.PI;
/** One degree of arc on the sphere, in metres. */
export const METRES_PER_DEG = 111195;
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

export const MSG_DEGENERATE = "Mark the object's base, its top and the tip of its shadow.";
const MSG_TOO_LOW = "The sun is too low for a reliable fix.";
const MSG_BEARING = "That bearing doesn't fit this sun height at that time.";
export const MSG_TIME = "Enter the date and time the photo was taken.";
const NOTE_OVERHEAD = "The sun was almost overhead, so its direction adds nothing; the circle alone places the photo.";
const ASSUMES = `That radius assumes the bearing is right to within ${BEARING_TOLERANCE_DEG}° and the time and its UTC offset are right.`;
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
  /** What it was solved from, recorded on the finding: the marks, in photo pixels. */
  marks: Marks;
  /** The shadow's bearing folded into [0, 360); null when none was given. */
  shadowBearingDeg: number | null;
  /** How far each mark may be off, in photo pixels. */
  pxSigma: number;
  /** The sun stood within 2 degrees of the zenith, so a bearing given was set aside for the circle. */
  overhead: boolean;
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

/**
 * Marks, photo time and optionally the shadow's compass bearing, resolved to a sun height and the
 * places that fit it. `pxSigma` is how far each mark may be off, in photo pixels (3 by default); a
 * view showing a large photo shrunk on screen passes 3 screen pixels' worth, since nobody can place
 * a mark finer than the screen (Ruling P4-R6). The place radius follows through the elevation band.
 * With the sun within 2 degrees of overhead a bearing is set aside and the fix is the circle.
 * The marks are taken as lying in the picture's plane: a shadow foreshortened by pointing towards
 * or away from the camera reads as a higher sun, an error the radius doesn't cover (Ruling P4-R8).
 */
export function solveShadow(input: { marks: Marks; timeUtc: Date; shadowBearingDeg?: number; pxSigma?: number }): ShadowFix | { error: string } {
  if (!Number.isFinite(input.timeUtc.getTime())) return { error: MSG_TIME };
  const pxSigma = input.pxSigma !== undefined && Number.isFinite(input.pxSigma) && input.pxSigma > 0 ? input.pxSigma : 3;
  const el = elevationFromMarks(input.marks, pxSigma);
  if ("error" in el) return { error: el.message };

  const subsolar = subsolarPoint(input.timeUtc);
  // The measured elevation is what the eye sees, refraction included; the geometry wants the true one.
  const zenithDeg = 90 - apparentToGeometric(el.elevationDeg);
  const fix: ShadowFix = {
    timeUtc: input.timeUtc,
    marks: input.marks,
    shadowBearingDeg: null,
    pxSigma,
    overhead: false,
    ...el,
    subsolar,
    zenithDeg,
    points: [],
    radiusM: null,
  };
  if (input.shadowBearingDeg === undefined) return fix;
  const bearing = normalizeBearing(input.shadowBearingDeg);
  // Overhead, the sun's direction is ill-defined, but the circle is small: it is the fix (Ruling P4-R13).
  if (zenithDeg < MIN_ZENITH_DEG) return { ...fix, shadowBearingDeg: bearing, overhead: true };

  // The shadow points away from the sun.
  const points = placesFor(subsolar, el.elevationDeg, bearing);
  if (points.length === 0) return { error: MSG_BEARING };
  return {
    ...fix,
    shadowBearingDeg: bearing,
    points,
    radiusM: propagatedRadiusM(subsolar, el.elevationDeg, el.uncertaintyDeg, bearing, points),
  };
}

const formatUtc = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
/** A latitude or longitude as the finding quotes it, to 1 dp: "51.5° N", "0.1° W". */
export const formatLat = (lat: number) => `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? "N" : "S"}`;
export const formatLon = (lon: number) => `${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? "E" : "W"}`;
export const formatPlace = (p: LatLon) => `${formatLat(p.lat)}, ${formatLon(p.lon)}`;
/** A distance as the finding quotes it, to the kilometre: "248 km". */
export const formatKm = (m: number) => `${Math.round(m / 1000)} km`;
/** The sun's height as the finding quotes it: "54.0° ± 1.2°". */
export const formatHeight = (fix: Pick<ShadowFix, "elevationDeg" | "uncertaintyDeg">) =>
  `${fix.elevationDeg.toFixed(1)}° ± ${fix.uncertaintyDeg.toFixed(1)}°`;
/**
 * The bearing echoed with the sun's direction it implies, to 0.1 degrees: "shadow 50.0°, so the sun
 * stood at 230.0°". A sun azimuth typed by mistake for the shadow's shows up here as a sun behind you.
 */
export const formatBearing = (shadowBearingDeg: number) => {
  const b = mod(Math.round(shadowBearingDeg * 10) / 10, 360);
  return `shadow ${b.toFixed(1)}°, so the sun stood at ${mod(b + 180, 360).toFixed(1)}°`;
};

/** The finding for a solved shadow: a place, two candidate places, or just the sun's height and its circle. */
export function shadowFinding(fix: ShadowFix): {
  title: string;
  body: string;
  detail: FindingDetail;
  meta: {
    sunLocus: { subsolarLat: number; subsolarLon: number; zenithDeg: number; bandDeg: number };
    points?: LatLon[];
    radiusM?: number;
    /** What the fix was solved from, so the finding can be checked or re-run. */
    inputs: { marks: Marks; shadowBearingDeg: number | null; pxSigma: number; timeUtc: string };
  };
} {
  const n = fix.points.length;
  if (n > 2) throw new Error(`shadowFinding: a sun height and direction fit at most two places, got ${n}`);
  const sunLocus = {
    subsolarLat: fix.subsolar.lat,
    subsolarLon: fix.subsolar.lon,
    zenithDeg: fix.zenithDeg,
    bandDeg: fix.uncertaintyDeg,
  };
  const inputs = { marks: fix.marks, shadowBearingDeg: fix.shadowBearingDeg, pxSigma: fix.pxSigma, timeUtc: fix.timeUtc.toISOString() };
  // Round once; the title and the body quote the same strings.
  const height = formatHeight(fix);
  const when = formatUtc(fix.timeUtc);
  const withBearing = fix.shadowBearingDeg === null ? "" : ` (${formatBearing(fix.shadowBearingDeg)})`;
  const elevation: FindingDetail = {
    kind: "measurement",
    value: fix.elevationDeg,
    unit: "° sun elevation",
    uncertainty: fix.uncertaintyDeg,
    // as the panel quotes it, not to the uncertainty's own first figure
    decimals: 1,
  };

  if (n === 1) {
    const [p] = fix.points;
    const radiusM = fix.radiusM ?? 0;
    return {
      title: `Shadow fix: ${formatPlace(p)}`,
      body: `At ${when} the sun stood ${height} above the horizon. With the shadow's bearing${withBearing} that puts the photo at ${formatPlace(p)}, within about ${formatKm(radiusM)}. ${ASSUMES} ${LIMIT}`,
      detail: { kind: "location", lat: p.lat, lon: p.lon, radiusM },
      meta: { sunLocus, radiusM, inputs },
    };
  }
  if (n === 2) {
    const radiusM = fix.radiusM ?? 0;
    // Discs that overlap are one answer, not two: say how wide the region they cover is (Ruling P4-R9).
    const apartM = angularDistanceDeg(fix.points[0], fix.points[1]) * METRES_PER_DEG;
    const merged =
      apartM < 2 * radiusM ? ` The two places are too close to tell apart; treat them as one region about ${formatKm(apartM + 2 * radiusM)} across.` : "";
    return {
      title: "Shadow fix: two possible places",
      body: `At ${when} the sun stood ${height} above the horizon. With the shadow's bearing${withBearing} the photo fits two places: ${fix.points.map(formatPlace).join(" and ")}, each within about ${formatKm(radiusM)}. The sun stood at the same height and direction over both.${merged} ${ASSUMES} ${LIMIT}`,
      detail: elevation,
      meta: { sunLocus, points: fix.points, radiusM, inputs },
    };
  }
  const overhead = fix.overhead ? ` ${NOTE_OVERHEAD}` : "";
  return {
    title: `Sun elevation: ${height}`,
    body: `At ${when} the sun stood ${height} above the horizon. It was directly overhead at ${formatPlace(fix.subsolar)}, so the photo lies on a circle of radius ${formatKm(fix.zenithDeg * METRES_PER_DEG)} around that point, give or take ${formatKm(fix.uncertaintyDeg * METRES_PER_DEG)}.${overhead} ${LIMIT}`,
    detail: elevation,
    meta: { sunLocus, inputs },
  };
}
