import type { FaceResult, Landmark } from "../models/types";

type Face = NonNullable<FaceResult>;

// Face Landmarker eye outlines as [corner, upper, upper, corner, lower, lower].
const EYES = {
  left: { ring: [33, 160, 158, 133, 153, 144], iris: 468 },
  right: { ring: [362, 385, 387, 263, 373, 380], iris: 473 },
} as const;

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);

/** Eye aspect ratio: lid opening relative to eye width (≈0.3 open, near 0 shut). */
export function eyeAspectRatio(face: Face, eye: "left" | "right"): number {
  const [p1, p2, p3, p4, p5, p6] = EYES[eye].ring.map((i) => face.landmarks[i]);
  const w = dist(p1, p4);
  return w > 0 ? (dist(p2, p6) + dist(p3, p5)) / (2 * w) : 0;
}

export type Gaze = "left" | "center" | "right" | "down";

/**
 * Where the eyes point, from each iris center's position inside the eye
 * outline (image coordinates, averaged over both eyes).
 */
export function gazeDirection(face: Face): Gaze {
  let hx = 0;
  let vy = 0;
  let n = 0;
  for (const e of Object.values(EYES)) {
    const ring = e.ring.map((i) => face.landmarks[i]);
    const iris = face.landmarks[e.iris];
    if (!iris) continue;
    const xs = [ring[0].x, ring[3].x];
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const top = Math.min(ring[1].y, ring[2].y);
    const bottom = Math.max(ring[4].y, ring[5].y);
    if (x1 - x0 <= 0 || bottom - top <= 0) continue;
    hx += (iris.x - x0) / (x1 - x0);
    vy += (iris.y - top) / (bottom - top);
    n++;
  }
  if (!n) return "center";
  hx /= n;
  vy /= n;
  if (vy > 0.62) return "down";
  if (hx < 0.4) return "left";
  if (hx > 0.6) return "right";
  return "center";
}

/** Counts blinks with hysteresis; closures longer than 1 s are not blinks. */
export class BlinkCounter {
  private closedAt: number | null = null;
  private blinks: number[] = [];
  private startedAt: number | null = null;
  private closeBelow: number;
  private openAbove: number;
  private windowS: number;

  constructor(opts: { closeBelow?: number; openAbove?: number; windowS?: number } = {}) {
    this.closeBelow = opts.closeBelow ?? 0.19;
    this.openAbove = opts.openAbove ?? 0.24;
    this.windowS = opts.windowS ?? 60;
  }

  push(tMs: number, ear: number): void {
    if (this.startedAt === null) this.startedAt = tMs;
    if (this.closedAt === null) {
      if (ear < this.closeBelow) this.closedAt = tMs;
    } else if (ear > this.openAbove) {
      if (tMs - this.closedAt <= 1000) this.blinks.push(tMs);
      this.closedAt = null;
    }
    const cutoff = tMs - this.windowS * 1000;
    while (this.blinks.length && this.blinks[0] < cutoff) this.blinks.shift();
  }

  reset(): void {
    this.closedAt = null;
    this.blinks = [];
    this.startedAt = null;
  }

  blinksPerMinute(tMs: number): number | null {
    if (this.startedAt === null || tMs - this.startedAt < 10_000) return null;
    const spanS = Math.min(this.windowS, (tMs - this.startedAt) / 1000);
    const n = this.blinks.filter((b) => b >= tMs - spanS * 1000).length;
    return Math.round((n / spanS) * 60);
  }
}

/** Share of recent time spent looking away from center. */
export class GazeTracker {
  private samples: Array<{ t: number; away: boolean }> = [];

  push(tMs: number, dir: Gaze): void {
    this.samples.push({ t: tMs, away: dir !== "center" });
    const cutoff = tMs - 120_000;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
  }

  reset(): void {
    this.samples = [];
  }

  awayPercent(tMs: number, windowS = 30): number {
    const recent = this.samples.filter((s) => s.t > tMs - windowS * 1000 && s.t <= tMs);
    if (!recent.length) return 0;
    return (100 * recent.filter((s) => s.away).length) / recent.length;
  }
}
