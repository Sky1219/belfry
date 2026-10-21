/** Sun elevation from three marks on a photo, the photo's UTC time, and the finding that follows. */

import type { FindingDetail } from "../../store/schema";
import type { PhotoMetadata } from "../photo/metadata";
import { fixesFromAzimuth } from "./geo";
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
 * The root sum of squares of six +-pxSigma steps is a one-sigma figure, and measured against marks
 * moved by up to 3 px it covered the true elevation only about 90% of the time and the true place
 * about 87% (the bearing constraint stretches the error along the circle). Times 1.5 it covers
 * about 99% of both for the demo scene, so the stated plus-or-minus and the place radius hold up.
 */
const COVERAGE_FACTOR = 1.5;

const MSG_DEGENERATE = "Mark the object's base, its top and the tip of its shadow.";
const MSG_TOO_LOW = "The sun is too low for a reliable fix.";
const MSG_BEARING = "That bearing doesn't fit this sun height at that time.";
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
}

/** Marks, photo time and optionally the shadow's compass bearing, resolved to a sun height and the places that fit it. */
export function solveShadow(input: { marks: Marks; timeUtc: Date; shadowBearingDeg?: number }): ShadowFix | { error: string } {
  if (!Number.isFinite(input.timeUtc.getTime())) return { error: MSG_TIME };
  const el = elevationFromMarks(input.marks);
  if ("error" in el) return { error: el.message };

  const subsolar = subsolarPoint(input.timeUtc);
  // The measured elevation is what the eye sees, refraction included; the geometry wants the true one.
  const zenithDeg = 90 - apparentToGeometric(el.elevationDeg);
  const fix: ShadowFix = { timeUtc: input.timeUtc, ...el, subsolar, zenithDeg, points: [] };
  if (input.shadowBearingDeg === undefined) return fix;

  // The shadow points away from the sun.
  const points = fixesFromAzimuth(subsolar, zenithDeg, normalizeBearing(input.shadowBearingDeg) + 180);
  if (points.length === 0) return { error: MSG_BEARING };
  return { ...fix, points };
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
    const radiusM = Math.round(fix.uncertaintyDeg * METRES_PER_DEG);
    return {
      title: `Shadow fix: ${formatPlace(p)}`,
      body: `At ${when} the sun stood ${height} above the horizon. With the shadow's bearing that puts the photo at ${formatPlace(p)}, within about ${Math.round(radiusM / 1000)} km. ${LIMIT}`,
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
    body: `At ${when} the sun stood ${height} above the horizon. It was directly overhead at ${formatPlace(fix.subsolar)}, so the photo lies on a circle of radius ${Math.round((fix.zenithDeg * METRES_PER_DEG) / 1000)} km around that point. ${LIMIT}`,
    detail: elevation,
    meta: { sunLocus },
  };
}
