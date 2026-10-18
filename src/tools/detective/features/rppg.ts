import type { Box, FaceResult, Landmark } from "../models/types";

/**
 * Camera heart rate (remote photoplethysmography).
 *
 * Each frame we average the skin color of the forehead and cheeks. Blood volume
 * changes with every heartbeat slightly alter how much green light skin absorbs.
 * The POS method (Wang et al., 2017) projects the RGB signal onto a plane
 * orthogonal to the skin tone, which cancels brightness changes and keeps the
 * pulse; the dominant frequency in 0.7–3.0 Hz is the heart rate.
 */

type RGB = [number, number, number];

// Face Landmarker indices: forehead center and cheek centers.
const FOREHEAD = 151;
const LEFT_CHEEK = 205;
const RIGHT_CHEEK = 425;

/** Forehead and both cheeks as normalized boxes, sized relative to the face box. */
export function faceRois(face: NonNullable<FaceResult>): Box[] {
  const [x0, y0, x1, y1] = face.box;
  const fw = x1 - x0;
  const fh = y1 - y0;
  const around = (p: Landmark | undefined, w: number, h: number): Box | null =>
    p ? [p.x - w / 2, p.y - h / 2, p.x + w / 2, p.y + h / 2] : null;
  return [
    around(face.landmarks[FOREHEAD], fw * 0.35, fh * 0.1),
    around(face.landmarks[LEFT_CHEEK], fw * 0.16, fh * 0.1),
    around(face.landmarks[RIGHT_CHEEK], fw * 0.16, fh * 0.1),
  ].filter((b): b is Box => !!b && b[2] > b[0] && b[3] > b[1]);
}

/** Mean RGB over the regions, read by drawing each region into a small scratch canvas. */
export function sampleRgb(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, video: HTMLVideoElement, rois: Box[]): RGB | null {
  const W = video.videoWidth;
  const H = video.videoHeight;
  if (!W || !H || rois.length === 0) return null;
  const cw = 32;
  const ch = 16;
  let r = 0, g = 0, b = 0, n = 0;
  for (const [x0, y0, x1, y1] of rois) {
    const sx = Math.max(0, x0 * W);
    const sy = Math.max(0, y0 * H);
    const sw = Math.min(W, x1 * W) - sx;
    const sh = Math.min(H, y1 * H) - sy;
    if (sw < 2 || sh < 2) continue;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
    const d = ctx.getImageData(0, 0, cw, ch).data;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      n++;
    }
  }
  return n ? [r / n, g / n, b / n] : null;
}

export interface HeartRateOpts {
  fs?: number;
  windowS?: number;
  minS?: number;
  minConfidence?: number;
}

export class HeartRateEstimator {
  private t: number[] = [];
  private c: RGB[] = [];
  private smoothed: number | null = null;
  private recent: Array<{ t: number; bpm: number }> = [];
  private fs: number;
  private windowS: number;
  private minS: number;
  private minConfidence: number;

  constructor(opts: HeartRateOpts = {}) {
    this.fs = opts.fs ?? 30;
    this.windowS = opts.windowS ?? 10;
    this.minS = opts.minS ?? 6;
    this.minConfidence = opts.minConfidence ?? 0.35;
  }

  push(tMs: number, rgb: RGB): void {
    const last = this.t[this.t.length - 1];
    if (last !== undefined && (tMs - last > 1000 || tMs <= last)) this.reset();
    this.t.push(tMs);
    this.c.push(rgb);
    const cutoff = tMs - this.windowS * 1000;
    let k = 0;
    while (k < this.t.length && this.t[k] < cutoff) k++;
    if (k) {
      this.t.splice(0, k);
      this.c.splice(0, k);
    }
  }

  reset(): void {
    this.t = [];
    this.c = [];
    this.smoothed = null;
    this.recent = [];
  }

  /** Seconds of continuous signal currently buffered. */
  spanS(): number {
    return this.t.length > 1 ? (this.t[this.t.length - 1] - this.t[0]) / 1000 : 0;
  }

  /**
   * One spectral estimate over the buffered window (no smoothing), or null if
   * there is under `minS` of signal, the peak is too weak, or the two halves of
   * the window disagree.
   */
  estimate(): { bpm: number; confidence: number } | null {
    if (this.spanS() < this.minS) return null;
    const rgb = resample(this.t, this.c, this.fs);
    const h = pos(rgb, Math.round(1.6 * this.fs));
    const peak = spectralPeak(h, this.fs, 0.7, 3.0);
    if (!peak || peak.confidence < this.minConfidence) return null;
    // A real pulse shows up in both halves of the window independently; a noise
    // peak usually doesn't. Require each half's peak to agree within 0.15 Hz (9 BPM).
    const half = h.length >> 1;
    for (const part of [h.slice(0, half), h.slice(half)]) {
      const p = spectralPeak(part, this.fs, 0.7, 3.0);
      if (!p || Math.abs(p.hz - peak.hz) > 0.15) return null;
    }
    return { bpm: peak.hz * 60, confidence: peak.confidence };
  }

  /**
   * The value to show the user: only reported when the last few estimates
   * (≥ 6 over ~3 s, called about twice a second) agree within 6 BPM. Noise
   * peaks wander from call to call; a real pulse stays put. Smoothed by EMA.
   */
  reading(tMs: number): { bpm: number; confidence: number } | null {
    const r = this.estimate();
    this.recent = this.recent.filter((x) => tMs - x.t <= 3200);
    if (!r) {
      this.recent = [];
      this.smoothed = null;
      return null;
    }
    this.recent.push({ t: tMs, bpm: r.bpm });
    const bpms = this.recent.map((x) => x.bpm);
    const stable = bpms.length >= 6 && Math.max(...bpms) - Math.min(...bpms) <= 6;
    if (!stable) return null;
    this.smoothed = this.smoothed === null ? r.bpm : this.smoothed * 0.8 + r.bpm * 0.2;
    return { bpm: this.smoothed, confidence: r.confidence };
  }
}

/** Linear resampling of irregular samples onto a uniform grid at `fs` Hz. */
export function resample(t: number[], c: RGB[], fs: number): RGB[] {
  const out: RGB[] = [];
  const step = 1000 / fs;
  let j = 0;
  for (let x = t[0]; x <= t[t.length - 1]; x += step) {
    while (j < t.length - 2 && t[j + 1] < x) j++;
    const span = t[j + 1] - t[j] || 1;
    const a = Math.min(1, Math.max(0, (x - t[j]) / span));
    out.push([0, 1, 2].map((k) => c[j][k] + (c[j + 1][k] - c[j][k]) * a) as RGB);
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
const std = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
};

/** POS: plane-orthogonal-to-skin projection with overlap-add over sliding windows of length l. */
export function pos(rgb: RGB[], l: number): number[] {
  const n = rgb.length;
  const h = new Array<number>(n).fill(0);
  for (let m = 0; m + l <= n; m++) {
    const win = rgb.slice(m, m + l);
    const mu = [0, 1, 2].map((k) => mean(win.map((p) => p[k])) || 1);
    const s1: number[] = [];
    const s2: number[] = [];
    for (const [r, g, b] of win) {
      const rn = r / mu[0];
      const gn = g / mu[1];
      const bn = b / mu[2];
      s1.push(gn - bn);
      s2.push(gn + bn - 2 * rn);
    }
    const alpha = std(s1) / (std(s2) || 1e-9);
    const hw = s1.map((v, i) => v + alpha * s2[i]);
    const hm = mean(hw);
    for (let i = 0; i < l; i++) h[m + i] += hw[i] - hm;
  }
  return h;
}

/** Peak frequency in [lo, hi] Hz with parabolic interpolation, and the share of band power near it. */
function spectralPeak(x: number[], fs: number, lo: number, hi: number): { hz: number; confidence: number } | null {
  const N = 1024;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const n = Math.min(x.length, N);
  const m = mean(x.slice(0, n));
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, n - 1)); // Hann
    re[i] = (x[i] - m) * w;
  }
  fft(re, im);
  const df = fs / N;
  const k0 = Math.ceil(lo / df);
  const k1 = Math.floor(hi / df);
  const pw = (k: number) => re[k] * re[k] + im[k] * im[k];
  let best = k0;
  let total = 0;
  for (let k = k0; k <= k1; k++) {
    total += pw(k);
    if (pw(k) > pw(best)) best = k;
  }
  if (total <= 0) return null;
  // parabolic interpolation around the peak bin
  let offset = 0;
  if (best > k0 && best < k1) {
    const a = pw(best - 1);
    const b = pw(best);
    const c = pw(best + 1);
    const d = a - 2 * b + c;
    if (d !== 0) offset = (0.5 * (a - c)) / d;
  }
  const hz = (best + offset) * df;
  const near = Math.round(0.1 / df);
  let peakPower = 0;
  for (let k = Math.max(k0, best - near); k <= Math.min(k1, best + near); k++) peakPower += pw(k);
  return { hz, confidence: peakPower / total };
}

/** In-place iterative radix-2 FFT (length must be a power of two). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}
