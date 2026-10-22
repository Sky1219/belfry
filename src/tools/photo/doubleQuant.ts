import { dct8x8, ZIGZAG } from "../../platform/math/dct8";

/** Zigzag positions 1-9: the low-frequency AC coefficients, where the comb survives noise. */
const FIRST_ZZ = 1;
const LAST_ZZ = 9;
/** Bins past this are ignored; the score looks at n = 1...MAX_BIN only. */
const MAX_BIN = 32;
/** A bin only counts while its local mean has at least this many samples. */
const MIN_TREND = 20;
const MIN_USABLE_BINS = 5;
/** Histograms are cut here: the score never reads past MAX_BIN plus the smoothing window. */
const HIST_LEN = MAX_BIN + 3;

/**
 * Periodicity score of coefficient histograms h(n), n = |quantized value|.
 * Each histogram is compared with its own 5-bin running mean; the score is the
 * spread of that ratio, so a smooth (single-save) histogram scores near 0 and
 * a comb of gaps and peaks (double save) scores high. The median over the
 * usable histograms is returned, or null when none has enough counts.
 */
export function dqScoreFromHistograms(hists: number[][]): number | null {
  const scores: number[] = [];
  for (const h of hists) {
    const trend = (n: number) => {
      let sum = 0;
      let count = 0;
      for (let i = Math.max(0, n - 2); i <= Math.min(h.length - 1, n + 2); i++) {
        sum += h[i];
        count++;
      }
      return sum / count;
    };
    let last = 0;
    for (let n = 1; n < h.length; n++) if (trend(n) >= MIN_TREND) last = n;
    const top = Math.min(MAX_BIN, last);
    if (top < MIN_USABLE_BINS) continue;
    const r: number[] = [];
    for (let n = 1; n <= top; n++) {
      const t = trend(n);
      r.push(t > 0 ? h[n] / t - 1 : 0);
    }
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    scores.push(Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length));
  }
  if (scores.length === 0) return null;
  scores.sort((a, b) => a - b);
  const mid = scores.length >> 1;
  const median = scores.length % 2 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2;
  return Math.min(1, Math.max(0, median));
}

/**
 * Double-quantization score of a grayscale image: the DCT of every whole 8x8
 * block on the grid from (0, 0), histogrammed per low-frequency coefficient as
 * round(|c| / q) with q from the luminance table (natural order). Null when
 * the image has no whole block or too few counts.
 */
export function dqScore(gray: Float32Array, w: number, h: number, luma: Uint16Array): number | null {
  const bw = Math.floor(w / 8);
  const bh = Math.floor(h / 8);
  if (bw === 0 || bh === 0) return null;
  const positions = ZIGZAG.slice(FIRST_ZZ, LAST_ZZ + 1);
  const q = positions.map((p) => Math.max(1, luma[p]));
  const hists = positions.map(() => new Array<number>(HIST_LEN).fill(0));
  const block = new Float64Array(64);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) block[y * 8 + x] = gray[(by * 8 + y) * w + bx * 8 + x] - 128;
      }
      const c = dct8x8(block);
      for (let i = 0; i < positions.length; i++) {
        const n = Math.round(Math.abs(c[positions[i]]) / q[i]);
        if (n < HIST_LEN) hists[i][n]++;
      }
    }
  }
  return dqScoreFromHistograms(hists);
}
