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

const LIMIT =
  "Regions much brighter than similar texture nearby were compressed differently. Resaving, resizing and filters also change error levels, so read the map, don't count it.";

/** The error level map's finding: a reading guide, never a verdict. */
export function elaFinding(): { title: string; body: string } {
  return {
    title: "Error levels: map",
    body: `The photo was re-saved as JPEG at quality ${Math.round(ELA_QUALITY * 100)} and compared pixel by pixel; brightness is the largest colour change ×${ELA_GAIN}, scaled from the 1st to the 99th percentile. ${LIMIT}`,
  };
}
