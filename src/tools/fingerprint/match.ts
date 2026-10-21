import type { FindingDetail } from "../../store/schema";
import { verdictFor, verdictTitle, type Verdict } from "../imagekit/verdict";
import type { Minutia } from "./minutiae";
import type { PrintAnalysis } from "./pipeline";

export interface MatchTolerance {
  distPx: number;
  angleDeg: number;
}

export interface MinutiaeMatch {
  /** matched / ((n1 + n2) / 2); 0 when either print has no minutiae. */
  score: number;
  matched: number;
  /** One-to-one pairs of indices into a and b. */
  pairs: Array<[number, number]>;
  /** Maps a's coordinates onto b's: rotate by theta about the origin, then add (tx, ty). */
  transform: { theta: number; tx: number; ty: number };
}

const DEFAULT_TOLERANCE: MatchTolerance = { distPx: 10, angleDeg: 20 };
const THRESHOLDS = { inconclusiveAt: 0.25, consistentAt: 0.4 };
/** Fewer minutiae than this in either print, or matched between them, cannot support a claim. */
const MIN_MINUTIAE = 12;
/** More minutiae than this in a print is noise read as ridges, not a print (Ruling P2-R9). */
export const MAX_MINUTIAE = 150;
const LIMIT = "Hobby-grade matching of two photos. This is not an identification.";
const BANDS = "Consistent at 0.40 or more with at least 12 matched minutiae, inconclusive from 0.25 to 0.39.";
/** Said before the limit on every reading that has a score short of "consistent" (Ruling P2-R11). */
const CAVEAT =
  "Photos taken at different distances or in different light can score low for the same finger; a low score is not evidence of a different finger.";

/** Normalises to (-pi, pi]. */
function wrap(a: number): number {
  const t = a % (2 * Math.PI);
  if (t > Math.PI) return t - 2 * Math.PI;
  if (t <= -Math.PI) return t + 2 * Math.PI;
  return t;
}

/** Absolute difference of two angles, radians in [0, pi]. */
function angleGap(p: number, q: number): number {
  const d = Math.abs(p - q) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/**
 * b's minutiae bucketed into square cells of `cell` px over their bounding box,
 * laid out flat: cell k holds items[start[k]] .. items[start[k + 1] - 1], in
 * index order, so a lookup only visits the 3 x 3 cells around a point.
 */
interface Grid {
  cell: number;
  x0: number;
  y0: number;
  gw: number;
  gh: number;
  start: Int32Array;
  items: Int32Array;
}

function gridOf(bx: Float64Array, by: Float64Array, cell: number): Grid {
  const n = bx.length;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let j = 0; j < n; j++) {
    x0 = Math.min(x0, Math.floor(bx[j] / cell));
    y0 = Math.min(y0, Math.floor(by[j] / cell));
    x1 = Math.max(x1, Math.floor(bx[j] / cell));
    y1 = Math.max(y1, Math.floor(by[j] / cell));
  }
  const gw = x1 - x0 + 1;
  const gh = y1 - y0 + 1;
  const cellOf = new Int32Array(n);
  const start = new Int32Array(gw * gh + 1);
  for (let j = 0; j < n; j++) {
    cellOf[j] = (Math.floor(by[j] / cell) - y0) * gw + Math.floor(bx[j] / cell) - x0;
    start[cellOf[j] + 1]++;
  }
  for (let k = 0; k < gw * gh; k++) start[k + 1] += start[k];
  const fill = start.slice(0, gw * gh);
  const items = new Int32Array(n);
  for (let j = 0; j < n; j++) items[fill[cellOf[j]]++] = j;
  return { cell, x0, y0, gw, gh, start, items };
}

/**
 * Rotation-invariant minutiae matching. Every same-kind (a_i, b_j) pair
 * proposes an alignment (rotate by the difference of their angles, then
 * translate a_i onto b_j); the alignment that pairs the most minutiae wins.
 * Under an alignment, each a minutia in turn takes the nearest unused b
 * minutia that is within the position and direction tolerances.
 *
 * The work grows as n_a^2 n_b, so the buffers are made once rather than per
 * alignment, and an alignment stops as soon as it can no longer beat the best
 * one, which changes no result (Ruling P2-R10).
 */
export function matchMinutiae(a: Minutia[], b: Minutia[], tol: MatchTolerance = DEFAULT_TOLERANCE): MinutiaeMatch {
  const na = a.length;
  const nb = b.length;
  let bestCount = 0;
  const bestA = new Int32Array(na);
  const bestB = new Int32Array(na);
  let transform = { theta: 0, tx: 0, ty: 0 };
  if (na > 0 && nb > 0) {
    const ax = Float64Array.from(a, (m) => m.x);
    const ay = Float64Array.from(a, (m) => m.y);
    const bx = Float64Array.from(b, (m) => m.x);
    const by = Float64Array.from(b, (m) => m.y);
    const { cell, x0, y0, gw, gh, start, items } = gridOf(bx, by, tol.distPx);
    const maxAngle = (tol.angleDeg * Math.PI) / 180;
    const maxD2 = tol.distPx * tol.distPx;
    // b_j is taken under the current alignment when used[j] === stamp, so nothing is cleared between alignments
    const used = new Int32Array(nb);
    let stamp = 0;
    const curA = new Int32Array(na);
    const curB = new Int32Array(na);

    for (let p = 0; p < na; p++) {
      for (let q = 0; q < nb; q++) {
        if (a[p].kind !== b[q].kind) continue;
        const theta = wrap(b[q].angle - a[p].angle);
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const tx = bx[q] - (c * ax[p] - s * ay[p]);
        const ty = by[q] - (s * ax[p] + c * ay[p]);
        stamp++;
        let count = 0;
        for (let i = 0; i < na; i++) {
          // the minutiae left can't lift this alignment past the best one
          if (count + (na - i) <= bestCount) break;
          const x = c * ax[i] - s * ay[i] + tx;
          const y = s * ax[i] + c * ay[i] + ty;
          const cx = Math.floor(x / cell) - x0;
          const cy = Math.floor(y / cell) - y0;
          let best = -1;
          let bestD2 = maxD2;
          for (let gy = Math.max(0, cy - 1); gy <= Math.min(gh - 1, cy + 1); gy++) {
            for (let gx = Math.max(0, cx - 1); gx <= Math.min(gw - 1, cx + 1); gx++) {
              const k = gy * gw + gx;
              for (let t = start[k]; t < start[k + 1]; t++) {
                const j = items[t];
                if (used[j] === stamp) continue;
                const d2 = (bx[j] - x) * (bx[j] - x) + (by[j] - y) * (by[j] - y);
                if (d2 > bestD2 || angleGap(a[i].angle + theta, b[j].angle) > maxAngle) continue;
                best = j;
                bestD2 = d2;
              }
            }
          }
          if (best >= 0) {
            used[best] = stamp;
            curA[count] = i;
            curB[count] = best;
            count++;
          }
        }
        if (count > bestCount) {
          bestCount = count;
          bestA.set(curA.subarray(0, count));
          bestB.set(curB.subarray(0, count));
          transform = { theta, tx, ty };
        }
      }
    }
  }
  const pairs = Array.from({ length: bestCount }, (_, k): [number, number] => [bestA[k], bestB[k]]);
  const mean = (na + nb) / 2;
  return { score: mean > 0 ? bestCount / mean : 0, matched: bestCount, pairs, transform };
}

/** What matching needs from an analysed print. */
export type MatchInput = Pick<PrintAnalysis, "minutiae" | "medianFrequency">;

/** A match between two analysed prints, with the factor b's minutiae were scaled by first. */
export type PrintMatch = MinutiaeMatch & { scale: number };

/**
 * Matches two analysed prints, as the lab does. A print with more than 150
 * minutiae is noise read as ridges and reads "too noisy" whatever the score
 * (Ruling P2-R9), so it isn't matched at all. Otherwise b's minutiae are first
 * scaled about their centroid by fB / fA, the ratio of the median ridge
 * frequencies, so the same finger photographed nearer or further lines up
 * (Ruling P2-R11); the angles, and so the rotation invariance, are untouched.
 * The pairs index into the original minutiae; `transform` maps a onto the
 * scaled b.
 */
export function comparePrints(a: MatchInput, b: MatchInput, tol: MatchTolerance = DEFAULT_TOLERANCE): PrintMatch {
  if (Math.max(a.minutiae.length, b.minutiae.length) > MAX_MINUTIAE) {
    return { score: 0, matched: 0, pairs: [], transform: { theta: 0, tx: 0, ty: 0 }, scale: 1 };
  }
  const scale = a.medianFrequency > 0 && b.medianFrequency > 0 ? b.medianFrequency / a.medianFrequency : 1;
  let mb = b.minutiae;
  if (scale !== 1 && mb.length > 0) {
    let cx = 0;
    let cy = 0;
    for (const m of mb) {
      cx += m.x / mb.length;
      cy += m.y / mb.length;
    }
    mb = mb.map((m) => ({ ...m, x: cx + (m.x - cx) * scale, y: cy + (m.y - cy) * scale }));
  }
  return { ...matchMinutiae(a.minutiae, mb, tol), scale };
}

/**
 * The fingerprint finding. Too little ridge detail in either print, so many
 * minutiae that they must be noise, or a good score on too few matched
 * minutiae, reads inconclusive with no score in the finding. The score is
 * rounded before it is banded, so the number shown and the verdict can't
 * disagree at a band edge. `verdict` and `score` (the rounded score, null when
 * there was too little ridge detail or too much noise to compute one) are
 * returned so callers decide on them rather than on the title's wording.
 */
export function fingerprintFinding(
  a: Minutia[],
  b: Minutia[],
  m: MinutiaeMatch,
): { title: string; body: string; detail?: FindingDetail; verdict: Verdict; score: number | null } {
  const inconclusive = verdictTitle("Fingerprint match", "inconclusive", "the same finger");
  const counts = `${a.length} and ${b.length} minutiae found in the two prints`;
  if (Math.min(a.length, b.length) < MIN_MINUTIAE) {
    return {
      verdict: "inconclusive",
      score: null,
      title: inconclusive,
      body: `There is not enough ridge detail to compare: ${counts}, and at least ${MIN_MINUTIAE} are needed in each. ${LIMIT}`,
    };
  }
  if (Math.max(a.length, b.length) > MAX_MINUTIAE) {
    return {
      verdict: "inconclusive",
      score: null,
      title: inconclusive,
      body: `The prints are too noisy to read reliably: ${counts}, and more than ${MAX_MINUTIAE} in one print means noise is being read as ridges. ${LIMIT}`,
    };
  }
  const score = Math.round(m.score * 100) / 100;
  const verdict = verdictFor(score, THRESHOLDS);
  if (verdict === "consistent" && m.matched < MIN_MINUTIAE) {
    return {
      verdict: "inconclusive",
      score,
      title: inconclusive,
      body: `The score is ${score.toFixed(2)}. The two prints have ${a.length} and ${b.length} minutiae, but only ${m.matched} matched; too few matched minutiae to rely on this score (${MIN_MINUTIAE} are needed). ${CAVEAT} ${LIMIT}`,
    };
  }
  return {
    verdict,
    score,
    title: verdictTitle("Fingerprint match", verdict, "the same finger"),
    body: `Score ${score.toFixed(2)}: ${m.matched} matched minutiae, with ${counts}. ${BANDS} ${verdict === "consistent" ? "" : `${CAVEAT} `}${LIMIT}`,
    detail: { kind: "measurement", value: score, unit: "match score", decimals: 2 },
  };
}
