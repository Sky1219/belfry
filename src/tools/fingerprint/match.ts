import type { FindingDetail } from "../../store/schema";
import { verdictFor, verdictTitle, type Verdict } from "../imagekit/verdict";
import type { Minutia } from "./minutiae";

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
const LIMIT = "Hobby-grade matching of two photos. This is not an identification.";
const BANDS = "Consistent at 0.40 or more with at least 12 matched minutiae, inconclusive from 0.25 to 0.39.";

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

/** A hash of b's minutiae into square cells, so a lookup only visits the 3 x 3 cells around a point. */
function gridOf(b: Minutia[], cell: number): Map<number, number[]> {
  const grid = new Map<number, number[]>();
  b.forEach((m, j) => {
    const key = cellKey(Math.floor(m.x / cell), Math.floor(m.y / cell));
    const list = grid.get(key);
    if (list) list.push(j);
    else grid.set(key, [j]);
  });
  return grid;
}

const cellKey = (cx: number, cy: number) => cx * 73856093 + cy * 19349663;

/**
 * Lays a over b under one alignment and pairs each a minutia with the nearest
 * unused b minutia that is within the position and direction tolerances.
 */
function pairUp(
  a: Minutia[],
  b: Minutia[],
  grid: Map<number, number[]>,
  tol: MatchTolerance,
  theta: number,
  tx: number,
  ty: number,
): Array<[number, number]> {
  const cell = tol.distPx;
  const maxAngle = (tol.angleDeg * Math.PI) / 180;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const used = new Set<number>();
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < a.length; i++) {
    const x = c * a[i].x - s * a[i].y + tx;
    const y = s * a[i].x + c * a[i].y + ty;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    let best = -1;
    let bestD = tol.distPx;
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (const j of grid.get(cellKey(gx, gy)) ?? []) {
          if (used.has(j)) continue;
          const d = Math.hypot(b[j].x - x, b[j].y - y);
          if (d > bestD || angleGap(a[i].angle + theta, b[j].angle) > maxAngle) continue;
          best = j;
          bestD = d;
        }
      }
    }
    if (best >= 0) {
      used.add(best);
      pairs.push([i, best]);
    }
  }
  return pairs;
}

/**
 * Rotation-invariant minutiae matching. Every (a_i, b_j) pair proposes an
 * alignment (rotate by the difference of their angles, then translate a_i onto
 * b_j); the alignment that pairs the most minutiae wins.
 */
export function matchMinutiae(a: Minutia[], b: Minutia[], tol: MatchTolerance = DEFAULT_TOLERANCE): MinutiaeMatch {
  let best: Array<[number, number]> = [];
  let transform = { theta: 0, tx: 0, ty: 0 };
  if (a.length > 0 && b.length > 0) {
    const grid = gridOf(b, tol.distPx);
    for (const ai of a) {
      for (const bj of b) {
        const theta = wrap(bj.angle - ai.angle);
        const tx = bj.x - (Math.cos(theta) * ai.x - Math.sin(theta) * ai.y);
        const ty = bj.y - (Math.sin(theta) * ai.x + Math.cos(theta) * ai.y);
        const pairs = pairUp(a, b, grid, tol, theta, tx, ty);
        if (pairs.length > best.length) {
          best = pairs;
          transform = { theta, tx, ty };
        }
      }
    }
  }
  const mean = (a.length + b.length) / 2;
  return { score: mean > 0 ? best.length / mean : 0, matched: best.length, pairs: best, transform };
}

/**
 * The fingerprint finding. Too little ridge detail in either print, or a good
 * score on too few matched minutiae, reads inconclusive with no score in the
 * finding. The score is rounded before it is banded, so the number shown and
 * the verdict can't disagree at a band edge. `verdict` and `score` (the rounded
 * score, null only when there was too little ridge detail to compute one) are
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
  const score = Math.round(m.score * 100) / 100;
  const verdict = verdictFor(score, THRESHOLDS);
  if (verdict === "consistent" && m.matched < MIN_MINUTIAE) {
    return {
      verdict: "inconclusive",
      score,
      title: inconclusive,
      body: `The score is ${score.toFixed(2)}, but only ${m.matched} minutiae matched, too few matched minutiae to rely on (${MIN_MINUTIAE} are needed). ${counts}. ${LIMIT}`,
    };
  }
  return {
    verdict,
    score,
    title: verdictTitle("Fingerprint match", verdict, "the same finger"),
    body: `Score ${score.toFixed(2)}: ${m.matched} matched minutiae, with ${counts}. ${BANDS} ${LIMIT}`,
    detail: { kind: "measurement", value: score, unit: "match score" },
  };
}
