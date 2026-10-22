import type { Pixels } from "../imagekit/pixels";

/** Values per group; the flip mask over them is [0, 1, 1, 0] (Fridrich, Goljan & Du). */
const GROUP = 4;
/** Fewer groups than this per channel and the counts are too thin to trust. */
const MIN_GROUPS = 64;
/**
 * A group touching 0-1 or 254-255 is skipped: at the ends of the range a flip
 * can't move both ways, so clipped highlights, black text on white and flat
 * fills skew the counts towards "embedded" (Ruling P3-R6).
 */
const saturated = (v: number): boolean => v <= 1 || v >= 254;

/** F1 swaps 2n and 2n+1. */
const flipUp = (v: number): number => v ^ 1;
/** F-1 swaps 2n-1 and 2n (0 and 255 may leave the range; only differences matter). */
const flipDown = (v: number): number => ((v + 1) ^ 1) - 1;

/** Discrimination function f = sum |x(i+1) - x(i)| over a group of 4. */
const variation = (a: number, b: number, c: number, d: number): number => Math.abs(b - a) + Math.abs(c - b) + Math.abs(d - c);

/**
 * Tallies one group into `tally` as [R_M, S_M, R_-M, S_-M]: regular when the
 * mask-flipped group varies more than the original, singular when it varies less.
 */
function classify(a: number, b: number, c: number, d: number, tally: Int32Array): void {
  const f = variation(a, b, c, d);
  const up = variation(a, flipUp(b), flipUp(c), d);
  if (up > f) tally[0]++;
  else if (up < f) tally[1]++;
  const down = variation(a, flipDown(b), flipDown(c), d);
  if (down > f) tally[2]++;
  else if (down < f) tally[3]++;
}

/**
 * Solves the RS quadratic for one channel's tallies. Counts are, in order,
 * [R_M, S_M, R_-M, S_-M] for the image and for the image with every LSB flipped.
 * Returns the embedded share (clamped to 0-1), or null when the equation has no real root.
 */
function solve(orig: Int32Array, flipped: Int32Array, groups: number): number | null {
  const d0 = (orig[0] - orig[1]) / groups;
  const dm0 = (orig[2] - orig[3]) / groups;
  const d1 = (flipped[0] - flipped[1]) / groups;
  const dm1 = (flipped[2] - flipped[3]) / groups;

  const a = 2 * (d1 + d0);
  const b = dm0 - dm1 - d1 - 3 * d0;
  const c = d0 - dm0;

  let x: number;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) return null;
    x = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    const x1 = (-b + root) / (2 * a);
    const x2 = (-b - root) / (2 * a);
    x = Math.abs(x1) <= Math.abs(x2) ? x1 : x2;
  }
  const p = x / (x - 0.5);
  return Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : null;
}

/**
 * RS steganalysis (Fridrich, Goljan & Du): estimates the share of the capacity
 * that sequential LSB embedding has filled. Each of R, G, B is read in
 * row-wise groups of 4 opaque values, skipping groups with a saturated value.
 * A channel with fewer than 64 such groups, or whose equation has no real
 * root, is left out (Ruling P3-R4) and the rest are averaged; `rate` is null
 * when every channel is left out. The estimate reads low for sequential
 * embedding on real photos, so it is never a verdict on its own.
 */
export function rsAnalysis(p: Pixels): { rate: number | null } {
  const estimates: number[] = [];
  const g = new Int32Array(GROUP);

  for (let c = 0; c < 3; c++) {
    const orig = new Int32Array(4);
    const flipped = new Int32Array(4);
    let groups = 0;
    for (let y = 0; y < p.height; y++) {
      let n = 0; // opaque values gathered for the current group
      for (let x = 0; x < p.width; x++) {
        const i = (y * p.width + x) * 4;
        if (p.data[i + 3] !== 255) continue;
        g[n] = p.data[i + c];
        if (++n < GROUP) continue;
        n = 0;
        if (saturated(g[0]) || saturated(g[1]) || saturated(g[2]) || saturated(g[3])) continue;
        groups++;
        classify(g[0], g[1], g[2], g[3], orig);
        // the same group with every LSB flipped
        classify(g[0] ^ 1, g[1] ^ 1, g[2] ^ 1, g[3] ^ 1, flipped);
      }
    }
    if (groups < MIN_GROUPS) continue;
    const est = solve(orig, flipped, groups);
    if (est !== null) estimates.push(est);
  }
  if (estimates.length === 0) return { rate: null };
  return { rate: estimates.reduce((s, v) => s + v, 0) / estimates.length };
}
