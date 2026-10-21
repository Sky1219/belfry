import type { orientationField } from "./orientation";

const BLOCK = 16;
const MIN_FREQ = 1 / 25;
const MAX_FREQ = 1 / 3;
/** Frequency window: samples across the ridges (the normal) by samples along them. */
const WIN_ACROSS = 32;
const WIN_ALONG = 16;
const GABOR_HALF = 5;
const GABOR_SIGMA = 4;

type Field = ReturnType<typeof orientationField>;

/** Bilinear sample with the coordinates clamped to the image. */
function sample(img: Float32Array, w: number, h: number, x: number, y: number): number {
  const cx = Math.min(w - 1, Math.max(0, x));
  const cy = Math.min(h - 1, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  return (
    img[y0 * w + x0] * (1 - fx) * (1 - fy) +
    img[y0 * w + x1] * fx * (1 - fy) +
    img[y1 * w + x0] * (1 - fx) * fy +
    img[y1 * w + x1] * fx * fy
  );
}

/**
 * Ridge frequency per block, in px^-1. A 32 x 16 window centred on the block is
 * turned to the ridge direction and averaged along the ridges, which leaves a
 * 32-sample signature across them; the mean spacing of its peaks is the period.
 * Masked-out blocks, and blocks with fewer than two peaks, read 0 (unknown).
 * Known values are clamped to [1/25, 1/3].
 */
export function ridgeFrequency(
  norm: Float32Array,
  w: number,
  h: number,
  field: Field,
  mask: Uint8Array,
): Float32Array {
  const { theta, bw, bh } = field;
  const freq = new Float32Array(bw * bh);
  const sig = new Float32Array(WIN_ACROSS);
  const smooth = new Float32Array(WIN_ACROSS);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const b = by * bw + bx;
      if (!mask[b]) continue;
      const cx = bx * BLOCK + BLOCK / 2;
      const cy = by * BLOCK + BLOCK / 2;
      const ux = Math.cos(theta[b]); // along the ridge
      const uy = Math.sin(theta[b]);
      const nx = -uy; // across the ridge
      const ny = ux;
      for (let k = 0; k < WIN_ACROSS; k++) {
        const across = k - (WIN_ACROSS - 1) / 2;
        let sum = 0;
        for (let j = 0; j < WIN_ALONG; j++) {
          const along = j - (WIN_ALONG - 1) / 2;
          sum += sample(norm, w, h, cx + across * nx + along * ux, cy + across * ny + along * uy);
        }
        sig[k] = sum / WIN_ALONG;
      }
      // A light [1 2 1] smooth keeps single-sample noise from reading as a peak.
      for (let k = 0; k < WIN_ACROSS; k++) {
        smooth[k] = (sig[Math.max(0, k - 1)] + 2 * sig[k] + sig[Math.min(WIN_ACROSS - 1, k + 1)]) / 4;
      }
      let first = -1;
      let last = -1;
      let peaks = 0;
      for (let k = 1; k < WIN_ACROSS - 1; k++) {
        if (smooth[k] > 0 && smooth[k] > smooth[k - 1] && smooth[k] >= smooth[k + 1]) {
          if (first < 0) first = k;
          last = k;
          peaks++;
        }
      }
      if (peaks < 2) continue;
      const period = (last - first) / (peaks - 1);
      freq[b] = Math.min(MAX_FREQ, Math.max(MIN_FREQ, 1 / period));
    }
  }
  return freq;
}

/** The median of the positive entries, or 0 when there are none. */
function medianKnown(freq: Float32Array): number {
  const known = Array.from(freq).filter((f) => f > 0).sort((a, b) => a - b);
  return known.length > 0 ? known[Math.floor(known.length / 2)] : 0;
}

/**
 * Gabor-filters each masked block with its own 11 x 11 even-symmetric kernel,
 * a cosine at the block's ridge frequency across the ridges under a round
 * Gaussian (sigma 4). The kernel is made zero-mean so flat areas stay at 0,
 * and scaled to unit absolute sum. Blocks with unknown frequency use the
 * median of the known ones. Pixels outside the mask, and the strip right and
 * below the last whole block, are 0.
 */
export function gaborEnhance(
  norm: Float32Array,
  w: number,
  h: number,
  field: Field,
  freq: Float32Array,
  mask: Uint8Array,
): Float32Array {
  const { theta, bw, bh } = field;
  const out = new Float32Array(w * h);
  const fallback = medianKnown(freq);
  if (fallback === 0) return out;
  const size = 2 * GABOR_HALF + 1;
  const kernel = new Float32Array(size * size);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const b = by * bw + bx;
      if (!mask[b]) continue;
      const f = freq[b] > 0 ? freq[b] : fallback;
      const nx = -Math.sin(theta[b]);
      const ny = Math.cos(theta[b]);
      let sum = 0;
      for (let ky = -GABOR_HALF; ky <= GABOR_HALF; ky++) {
        for (let kx = -GABOR_HALF; kx <= GABOR_HALF; kx++) {
          const across = kx * nx + ky * ny;
          const v =
            Math.exp(-(kx * kx + ky * ky) / (2 * GABOR_SIGMA * GABOR_SIGMA)) * Math.cos(2 * Math.PI * f * across);
          kernel[(ky + GABOR_HALF) * size + kx + GABOR_HALF] = v;
          sum += v;
        }
      }
      const mean = sum / kernel.length;
      let abs = 0;
      for (let i = 0; i < kernel.length; i++) {
        kernel[i] -= mean;
        abs += Math.abs(kernel[i]);
      }
      for (let i = 0; i < kernel.length; i++) kernel[i] /= abs;

      for (let y = by * BLOCK; y < (by + 1) * BLOCK; y++) {
        for (let x = bx * BLOCK; x < (bx + 1) * BLOCK; x++) {
          let acc = 0;
          for (let ky = -GABOR_HALF; ky <= GABOR_HALF; ky++) {
            const sy = Math.min(h - 1, Math.max(0, y + ky));
            for (let kx = -GABOR_HALF; kx <= GABOR_HALF; kx++) {
              const sx = Math.min(w - 1, Math.max(0, x + kx));
              acc += norm[sy * w + sx] * kernel[(ky + GABOR_HALF) * size + kx + GABOR_HALF];
            }
          }
          out[y * w + x] = acc;
        }
      }
    }
  }
  return out;
}

/** 1 where the enhanced value is above 0 (a ridge), else 0. */
export function binarize(enh: Float32Array): Uint8Array {
  const out = new Uint8Array(enh.length);
  for (let i = 0; i < enh.length; i++) out[i] = enh[i] > 0 ? 1 : 0;
  return out;
}
