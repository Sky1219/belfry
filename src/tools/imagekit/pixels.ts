/** RGBA pixels, row-major, 4 bytes per pixel. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Largest photo Belfry will decode, in pixels (8000 x 5000). */
export const MAX_PIXELS = 40_000_000;

export function fitWithin(w: number, h: number, max = MAX_PIXELS): boolean {
  return w * h <= max;
}

export function makePixels(w: number, h: number, rgba?: [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  if (rgba) for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width: w, height: h, data };
}

/** BT.601 luma of each pixel, 0-255. */
export function toGray(p: Pixels): Float32Array {
  const n = p.width * p.height;
  const out = new Float32Array(n);
  const d = p.data;
  for (let i = 0; i < n; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return out;
}

/**
 * Box-filter `p` so its long side is at most `maxSide`, keeping the aspect
 * ratio. Returns `p` itself when it already fits.
 */
export function downscale(p: Pixels, maxSide: number): Pixels {
  const long = Math.max(p.width, p.height);
  if (long <= maxSide) return p;
  const scale = maxSide / long;
  const w = Math.max(1, Math.round(p.width * scale));
  const h = Math.max(1, Math.round(p.height * scale));
  const out = makePixels(w, h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * p.height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * p.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * p.width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * p.width) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * p.width + sx) * 4;
          r += p.data[i];
          g += p.data[i + 1];
          b += p.data[i + 2];
          a += p.data[i + 3];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      out.data.set([r / n, g / n, b / n, a / n], (y * w + x) * 4);
    }
  }
  return out;
}

/**
 * Box-filter a per-pixel value map (w x h) so its long side is at most
 * `maxSide`, as `downscale` does for pixels. Returns `values` itself when it
 * already fits.
 */
export function downscaleValues(
  values: Float32Array,
  w: number,
  h: number,
  maxSide: number,
): { values: Float32Array; width: number; height: number } {
  const long = Math.max(w, h);
  if (long <= maxSide) return { values, width: w, height: h };
  const scale = maxSide / long;
  const ow = Math.max(1, Math.round(w * scale));
  const oh = Math.max(1, Math.round(h * scale));
  const out = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    const y0 = Math.floor((y * h) / oh);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / oh));
    for (let x = 0; x < ow; x++) {
      const x0 = Math.floor((x * w) / ow);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / ow));
      let sum = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) sum += values[sy * w + sx];
      out[y * ow + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return { values: out, width: ow, height: oh };
}
