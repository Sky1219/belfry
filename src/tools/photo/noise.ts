import type { FindingDetail } from "../../store/schema";

const BLOCK = 16;

/** 3x3 median of `gray` with replicated edges. */
function median3x3(gray: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const win = new Array<number>(9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          win[k++] = gray[yy * w + xx];
        }
      }
      win.sort((p, q) => p - q);
      out[y * w + x] = win[4];
    }
  }
  return out;
}

/** The noise residual: the image minus its 3x3 median. A flat image gives all zeros. */
export function noiseResidual(gray: Float32Array, w: number, h: number): Float32Array {
  const med = median3x3(gray, w, h);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = gray[i] - med[i];
  return out;
}

/**
 * Standard deviation of the residual in each full `block` x `block` square,
 * row-major over a bw x bh grid. Partial blocks at the right and bottom edges
 * are left out, so an image smaller than one block has bw = bh = 0.
 */
export function blockSigma(
  residual: Float32Array,
  w: number,
  h: number,
  block = BLOCK,
): { sigma: Float32Array; bw: number; bh: number } {
  const bw = Math.floor(w / block);
  const bh = Math.floor(h / block);
  const sigma = new Float32Array(bw * bh);
  const count = block * block;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sum = 0;
      let sumSq = 0;
      for (let y = by * block; y < (by + 1) * block; y++) {
        for (let x = bx * block; x < (bx + 1) * block; x++) {
          const v = residual[y * w + x];
          sum += v;
          sumSq += v * v;
        }
      }
      const mean = sum / count;
      sigma[by * bw + bx] = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
    }
  }
  return { sigma, bw, bh };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * How unevenly the noise is spread: the coefficient of variation of the finite
 * block sigmas. Null with fewer than 4 blocks or a median sigma of 0 (flat image).
 */
export function noiseInconsistency(sigma: Float32Array): number | null {
  const vals: number[] = [];
  for (let i = 0; i < sigma.length; i++) if (Number.isFinite(sigma[i])) vals.push(sigma[i]);
  if (vals.length < 4 || median(vals) === 0) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mean === 0) return null;
  const variance = vals.reduce((a, v) => a + (v - mean) * (v - mean), 0) / vals.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Per pixel, its block's sigma divided by the median block sigma. Pixels in
 * partial edge blocks get 0, and so does everything when there are no full
 * blocks or the median sigma is 0.
 */
export function noiseMap(gray: Float32Array, w: number, h: number): Float32Array {
  return mapFromSigma(blockSigma(noiseResidual(gray, w, h), w, h), w, h);
}

/** The noise map and the inconsistency score from one pass over the residual. */
export function noiseAnalysis(gray: Float32Array, w: number, h: number): { map: Float32Array; inconsistency: number | null } {
  const blocks = blockSigma(noiseResidual(gray, w, h), w, h);
  return { map: mapFromSigma(blocks, w, h), inconsistency: noiseInconsistency(blocks.sigma) };
}

function mapFromSigma({ sigma, bw, bh }: { sigma: Float32Array; bw: number; bh: number }, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const vals: number[] = [];
  for (let i = 0; i < sigma.length; i++) if (Number.isFinite(sigma[i])) vals.push(sigma[i]);
  if (vals.length === 0) return out;
  const med = median(vals);
  if (med === 0) return out;
  for (let y = 0; y < bh * BLOCK; y++) {
    for (let x = 0; x < bw * BLOCK; x++) {
      const s = sigma[Math.floor(y / BLOCK) * bw + Math.floor(x / BLOCK)];
      out[y * w + x] = Number.isFinite(s) ? s / med : 0;
    }
  }
  return out;
}

const LIMIT = "Pasted regions often carry different sensor noise. Smooth areas, blur and heavy compression also lower noise.";

/** The noise map's finding: a reading guide and the σ spread as a measurement, never a verdict. */
export function noiseFinding(inconsistency: number | null): { title: string; body: string; detail: FindingDetail } {
  const guide = `The map shows each ${BLOCK} px block's noise relative to the image's median; brighter blocks are noisier.`;
  if (inconsistency === null || !Number.isFinite(inconsistency)) {
    return {
      title: "Noise residual: map",
      body: `${guide} There is too little image to measure the spread: fewer than four whole blocks, or no noise at all. ${LIMIT}`,
      detail: { kind: "measurement", value: null, unit: "σ spread" },
    };
  }
  return {
    title: "Noise residual: map",
    body: `${guide} σ spread ${inconsistency.toFixed(2)}: the coefficient of variation of the block noise levels. ${LIMIT}`,
    detail: { kind: "measurement", value: Math.round(inconsistency * 100) / 100, unit: "σ spread" },
  };
}
