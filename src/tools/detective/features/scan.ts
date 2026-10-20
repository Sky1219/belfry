import type { Box } from "../models/types";
import type { Track } from "./tracker";

const area = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);
const contains = (b: Box, x: number, y: number) => b[0] <= x && x <= b[2] && b[1] <= y && y <= b[3];

export interface ScanUpdate {
  targetId: number | null;
  progress01: number;
  fire: Track | null;
}

/**
 * Decides when to scan: an evidence object held under the center reticle for
 * `dwellMs` fires once, then that object cools down for `cooldownMs`.
 * Clicking an object scans it immediately.
 */
export class ScanController {
  private targetId: number | null = null;
  private start = 0;
  private cooldown = new Map<number, number>();
  private dwellMs: number;
  private cooldownMs: number;

  constructor(opts: { dwellMs?: number; cooldownMs?: number } = {}) {
    this.dwellMs = opts.dwellMs ?? 2000;
    this.cooldownMs = opts.cooldownMs ?? 10_000;
  }

  update(tMs: number, tracks: Track[], center: { nx: number; ny: number }): ScanUpdate {
    const cool = (t: Track) => {
      const at = this.cooldown.get(t.id);
      return at !== undefined && tMs - at < this.cooldownMs;
    };
    const target = tracks
      .filter((t) => contains(t.box, center.nx, center.ny) && !cool(t))
      .sort((a, b) => area(a.box) - area(b.box))[0];

    if (!target) {
      this.targetId = null;
      return { targetId: null, progress01: 0, fire: null };
    }
    if (target.id !== this.targetId) {
      this.targetId = target.id;
      this.start = tMs;
    }
    const progress01 = Math.min(1, (tMs - this.start) / this.dwellMs);
    if (progress01 >= 1) {
      this.cooldown.set(target.id, tMs);
      this.targetId = null;
      return { targetId: target.id, progress01: 1, fire: target };
    }
    return { targetId: target.id, progress01, fire: null };
  }

  clickScan(track: Track, tMs: number): Track | null {
    this.cooldown.set(track.id, tMs);
    if (this.targetId === track.id) this.targetId = null;
    return track;
  }
}

/** Center 40% of the frame, for `S` scans with no detected object. */
export const centerRegion = (): Box => [0.3, 0.3, 0.7, 0.7];

/** Source-pixel crop of a normalized box plus padding, clamped to the frame, output long side ≤ maxSide. */
export function cropRect(box: Box, srcW: number, srcH: number, pad = 0.15, maxSide = 512) {
  const w = (box[2] - box[0]) * srcW;
  const h = (box[3] - box[1]) * srcH;
  const x0 = Math.max(0, box[0] * srcW - w * pad);
  const y0 = Math.max(0, box[1] * srcH - h * pad);
  const x1 = Math.min(srcW, box[2] * srcW + w * pad);
  const y1 = Math.min(srcH, box[3] * srcH + h * pad);
  const sw = Math.max(1, x1 - x0);
  const sh = Math.max(1, y1 - y0);
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  return { sx: x0, sy: y0, sw, sh, outW: Math.max(1, Math.round(sw * s)), outH: Math.max(1, Math.round(sh * s)) };
}
