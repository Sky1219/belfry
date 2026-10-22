/** Seeded generator, uniform in [0, 1). The same seed always gives the same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The q-th quantile (q in 0-1) by linear interpolation. Non-finite values are
 * ignored; the result is NaN only when no finite value is left.
 */
export function percentile(values: ArrayLike<number>, q: number): number {
  const sorted: number[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) sorted.push(values[i]);
  if (sorted.length === 0) return NaN;
  sorted.sort((a, b) => a - b);
  const pos = Math.min(1, Math.max(0, q)) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
