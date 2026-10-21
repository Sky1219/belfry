import type { Pixels } from "../imagekit/pixels";
import { opaqueChannels } from "./lsb";

const EPS = 1e-12;
const MAX_ITER = 500;
const TINY = 1e-300;

/** ln Γ(x) for x > 0 (Lanczos, g = 7). */
function logGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let sum = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) sum += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** Regularised lower incomplete gamma P(a, x): a series for x < a + 1, a continued fraction otherwise. */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  const lead = Math.exp(-x + a * Math.log(x) - logGamma(a));
  if (x < a + 1) {
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n < MAX_ITER; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * EPS) break;
    }
    return Math.min(1, sum * lead);
  }
  // modified Lentz evaluation of the continued fraction for Q(a, x)
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < MAX_ITER; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return Math.max(0, 1 - lead * h);
}

/** Chi-square cumulative distribution function with `df` degrees of freedom. */
export function chi2cdf(x: number, df: number): number {
  return gammaP(df / 2, x / 2);
}

/**
 * The Westfeld-Pfitzmann pairs-of-values attack. Sequential LSB embedding
 * equalises the counts of each value pair (2i, 2i+1), so for each prefix of
 * the opaque channel stream (fractions 1/steps ... 1) p is the chance the
 * prefix's pair counts are that even: p near 1 means "looks embedded".
 * A prefix with fewer than 2 usable pairs carries no evidence and reads 0.
 */
export function chiSquareAttack(p: Pixels, steps = 10): Array<{ fraction: number; p: number }> {
  const total = opaqueChannels(p);
  const hist = new Float64Array(256);
  const out: Array<{ fraction: number; p: number }> = [];

  const score = (): number => {
    let chi = 0;
    let used = 0;
    for (let i = 0; i < 128; i++) {
      const expected = (hist[2 * i] + hist[2 * i + 1]) / 2;
      if (expected <= 4) continue;
      const diff = hist[2 * i] - expected;
      chi += (diff * diff) / expected;
      used++;
    }
    return used < 2 ? 0 : 1 - chi2cdf(chi, used - 1);
  };

  // One pass over the same stream as `channelIndices` (R, G, B of opaque pixels, row-major),
  // scoring at each checkpoint; no index array, so a large image costs no extra memory.
  let seen = 0;
  let pos = 0; // start of the current pixel in p.data
  let ch = 0; // next channel (0-2) within that pixel
  for (let k = 1; k <= steps; k++) {
    const limit = k === steps ? total : Math.floor((total * k) / steps);
    while (seen < limit) {
      if (ch === 0 && p.data[pos + 3] !== 255) {
        pos += 4;
        continue;
      }
      hist[p.data[pos + ch]]++;
      seen++;
      if (++ch === 3) {
        ch = 0;
        pos += 4;
      }
    }
    out.push({ fraction: k / steps, p: score() });
  }
  return out;
}
