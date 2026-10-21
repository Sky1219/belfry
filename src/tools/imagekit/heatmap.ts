import { type Pixels, makePixels } from "./pixels";
import { percentile } from "./rng";

const AMBER = [255, 167, 51] as const; // #ffa733

/**
 * Colours a per-pixel score map: black through amber (#ffa733) to white.
 * Without `range` the ramp spans the 1st to 99th percentile, so a few extreme
 * values don't wash out the rest. Non-finite values and a flat range are black.
 */
export function heatmapPixels(
  values: Float32Array,
  w: number,
  h: number,
  range?: { lo: number; hi: number },
): Pixels {
  const lo = range ? range.lo : percentile(values, 0.01);
  const hi = range ? range.hi : percentile(values, 0.99);
  const out = makePixels(w, h);
  const span = hi - lo;
  for (let i = 0; i < w * h; i++) {
    const t = span > 0 ? Math.min(1, Math.max(0, (values[i] - lo) / span)) : 0;
    const o = i * 4;
    // NaN fails both comparisons below and stays black.
    if (t > 0 && t <= 0.5) {
      const u = t / 0.5;
      for (let c = 0; c < 3; c++) out.data[o + c] = Math.round(AMBER[c] * u);
    } else if (t > 0.5) {
      const u = (t - 0.5) / 0.5;
      for (let c = 0; c < 3; c++) out.data[o + c] = Math.round(AMBER[c] + (255 - AMBER[c]) * u);
    }
    out.data[o + 3] = 255;
  }
  return out;
}
