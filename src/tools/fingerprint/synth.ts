import { mulberry32 } from "../imagekit/rng";

export interface SynthPrint {
  /** Grayscale 0-255, row-major. */
  gray: Float32Array;
  width: number;
  height: number;
  /** Ridge direction at an output pixel, in radians in [0, pi). */
  orientationAt(x: number, y: number): number;
  /** Local ridge frequency |grad psi| / 2pi at an output pixel, in px^-1. */
  frequencyAt(x: number, y: number): number;
  /** One phase dislocation (one minutia) each, in output coordinates. */
  defects: Array<{ x: number; y: number }>;
}

export interface SynthOptions {
  seed: number;
  width?: number;
  height?: number;
  /** Ridge period along the major axis, px. */
  period?: number;
  /** Turns the print about the frame centre; defects and orientations turn with it. */
  rotateDeg?: number;
  dx?: number;
  dy?: number;
  /** Gaussian noise sigma as a fraction of 255. */
  noise?: number;
}

const DEFECTS = 30;
const WARP_TERMS = 3;
const WARP_AMPLITUDE = 6;
/** The core's ridges are 1.6x denser along y, so the whorl is an ellipse. */
const Y_STRETCH = 1.6;
/** Dislocations stay this far from the frame edge and each other, so each reads as one minutia. */
const DEFECT_MARGIN = 36;
const DEFECT_GAP = 22;

/** One standard-normal draw (Box-Muller) from a uniform generator. */
function gaussian(rand: () => number): number {
  const u = 1 - rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/**
 * A synthetic fingerprint: elliptical ridges around a core, a smooth seeded
 * warp, and 30 phase dislocations. Everything is derived from the phase
 * field psi, so the ridge direction is known exactly (perpendicular to its
 * gradient). Rotation and shift move the sampling grid, and `defects` and
 * `orientationAt` are moved with it. Defects that leave the frame are dropped.
 */
export function synthPrint(o: SynthOptions): SynthPrint {
  const width = o.width ?? 320;
  const height = o.height ?? 400;
  const period = o.period ?? 9;
  const noise = o.noise ?? 0.15;
  const dx = o.dx ?? 0;
  const dy = o.dy ?? 0;
  const rot = ((o.rotateDeg ?? 0) * Math.PI) / 180;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const rand = mulberry32(o.seed);
  const cx = width / 2;
  const cy = height / 2;

  // Smooth warp: a few low-frequency plane waves, summing to at most the amplitude.
  const waves = Array.from({ length: WARP_TERMS }, () => {
    const dir = rand() * 2 * Math.PI;
    const k = (2 * Math.PI) / (90 + rand() * 110);
    return { kx: k * Math.cos(dir), ky: k * Math.sin(dir), phase: rand() * 2 * Math.PI };
  });
  const waveAmp = WARP_AMPLITUDE / WARP_TERMS;

  // Dislocations in source coordinates, by rejection against the margin and each other.
  const source: Array<{ x: number; y: number }> = [];
  for (let tries = 0; source.length < DEFECTS && tries < 5000; tries++) {
    const x = DEFECT_MARGIN + rand() * (width - 2 * DEFECT_MARGIN);
    const y = DEFECT_MARGIN + rand() * (height - 2 * DEFECT_MARGIN);
    if (Math.hypot(x - cx, y - cy) < DEFECT_GAP) continue;
    if (source.some((d) => Math.hypot(d.x - x, d.y - y) < DEFECT_GAP)) continue;
    source.push({ x, y });
  }

  /** psi and its gradient in source coordinates. */
  const field = (x: number, y: number): { psi: number; gx: number; gy: number } => {
    const ex = x - cx;
    const ey = Y_STRETCH * (y - cy);
    const rho = Math.hypot(ex, ey);
    let r = rho;
    let rx = rho > 0 ? ex / rho : 0;
    let ry = rho > 0 ? (Y_STRETCH * ey) / rho : 0;
    for (const w of waves) {
      const a = w.kx * x + w.ky * y + w.phase;
      r += waveAmp * Math.sin(a);
      rx += waveAmp * w.kx * Math.cos(a);
      ry += waveAmp * w.ky * Math.cos(a);
    }
    const scale = (2 * Math.PI) / period;
    let psi = scale * r;
    let gx = scale * rx;
    let gy = scale * ry;
    for (const d of source) {
      const px = x - d.x;
      const py = y - d.y;
      const r2 = px * px + py * py;
      psi += Math.atan2(py, px);
      if (r2 > 0) {
        gx -= py / r2;
        gy += px / r2;
      }
    }
    return { psi, gx, gy };
  };

  /** Output -> source: out = c + R(src - c) + d. */
  const toSource = (x: number, y: number): [number, number] => {
    const ux = x - cx - dx;
    const uy = y - cy - dy;
    return [cx + cosR * ux + sinR * uy, cy - sinR * ux + cosR * uy];
  };

  const gray = new Float32Array(width * height);
  const sigma = noise * 255;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sx, sy] = toSource(x, y);
      const v = 127 + 100 * Math.cos(field(sx, sy).psi) + sigma * gaussian(rand);
      gray[y * width + x] = Math.min(255, Math.max(0, v));
    }
  }

  const defects: Array<{ x: number; y: number }> = [];
  for (const d of source) {
    const ux = d.x - cx;
    const uy = d.y - cy;
    const x = cx + cosR * ux - sinR * uy + dx;
    const y = cy + sinR * ux + cosR * uy + dy;
    if (x >= 0 && x < width && y >= 0 && y < height) defects.push({ x, y });
  }

  const orientationAt = (x: number, y: number): number => {
    const [sx, sy] = toSource(x, y);
    const g = field(sx, sy);
    // The gradient turns with the print; the ridge runs perpendicular to it.
    const ox = cosR * g.gx - sinR * g.gy;
    const oy = sinR * g.gx + cosR * g.gy;
    const t = (Math.atan2(oy, ox) + Math.PI / 2) % Math.PI;
    return t < 0 ? t + Math.PI : t;
  };

  const frequencyAt = (x: number, y: number): number => {
    const [sx, sy] = toSource(x, y);
    const g = field(sx, sy);
    // Rotation leaves the gradient's length alone.
    return Math.hypot(g.gx, g.gy) / (2 * Math.PI);
  };

  return { gray, width, height, orientationAt, frequencyAt, defects };
}
