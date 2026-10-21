import type { Pixels } from "../imagekit/pixels";

/** JPEG quality the photo is re-saved at before comparing. */
export const ELA_QUALITY = 0.9;
/** The difference is multiplied by this so small errors become visible. */
export const ELA_GAIN = 20;

/**
 * Error level map: per pixel, the largest red/green/blue difference between
 * the photo and its re-saved copy, times ELA_GAIN, clipped to 255.
 */
export function elaMap(original: Pixels, resaved: Pixels): Float32Array {
  if (original.width !== resaved.width || original.height !== resaved.height) {
    throw new Error("elaMap: images differ in size");
  }
  const n = original.width * original.height;
  const a = original.data;
  const b = resaved.data;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const d = Math.max(Math.abs(a[j] - b[j]), Math.abs(a[j + 1] - b[j + 1]), Math.abs(a[j + 2] - b[j + 2]));
    out[i] = Math.min(255, d * ELA_GAIN);
  }
  return out;
}
