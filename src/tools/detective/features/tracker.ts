import type { Box, Detection } from "../models/types";

/** COCO classes treated as potential evidence. People are never evidence. */
export const EVIDENCE_CLASSES: ReadonlySet<string> = new Set([
  "cell phone",
  "bottle",
  "cup",
  "wine glass",
  "book",
  "laptop",
  "remote",
  "keyboard",
  "mouse",
  "scissors",
  "knife",
  "backpack",
  "handbag",
  "umbrella",
  "clock",
  "vase",
  "teddy bear",
  "toothbrush",
  "fork",
  "spoon",
  "sports ball",
]);

export interface Track {
  id: number;
  tag: string;
  label: string;
  score: number;
  box: Box;
  firstSeenMs: number;
  lastSeenMs: number;
}

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const area = (r: Box) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Keeps stable ids and smoothed boxes for evidence objects between detector
 * runs (which happen only every few frames). Greedy IoU matching, same label only.
 */
export class Tracker {
  private list: Track[] = [];
  private nextId = 1;
  private iouMatch: number;
  private smoothing: number;
  private dropAfterMs: number;

  constructor(opts: { iouMatch?: number; smoothing?: number; dropAfterMs?: number } = {}) {
    this.iouMatch = opts.iouMatch ?? 0.3;
    this.smoothing = opts.smoothing ?? 0.5;
    this.dropAfterMs = opts.dropAfterMs ?? 500;
  }

  update(dets: Detection[], tMs: number): Track[] {
    const candidates = dets.filter((d) => EVIDENCE_CLASSES.has(d.label));
    const live = this.tracks(tMs);
    const pairs: Array<{ t: Track; d: Detection; s: number }> = [];
    for (const t of live) {
      for (const d of candidates) {
        if (d.label !== t.label) continue;
        const s = iou(t.box, d.box);
        if (s >= this.iouMatch) pairs.push({ t, d, s });
      }
    }
    pairs.sort((a, b) => b.s - a.s);
    const usedT = new Set<Track>();
    const usedD = new Set<Detection>();
    const k = this.smoothing;
    for (const { t, d } of pairs) {
      if (usedT.has(t) || usedD.has(d)) continue;
      usedT.add(t);
      usedD.add(d);
      t.box = t.box.map((v, i) => v + (d.box[i] - v) * k) as Box;
      t.score = d.score;
      t.lastSeenMs = tMs;
    }
    for (const d of candidates) {
      if (usedD.has(d)) continue;
      const id = this.nextId++;
      this.list.push({
        id,
        tag: `EV-${String(id).padStart(2, "0")}`,
        label: d.label,
        score: d.score,
        box: [...d.box] as Box,
        firstSeenMs: tMs,
        lastSeenMs: tMs,
      });
    }
    return this.tracks(tMs);
  }

  /** Tracks seen within the last `dropAfterMs`; older ones are discarded. */
  tracks(tMs: number): Track[] {
    this.list = this.list.filter((t) => tMs - t.lastSeenMs <= this.dropAfterMs);
    return [...this.list];
  }

  get(id: number): Track | undefined {
    return this.list.find((t) => t.id === id);
  }
}
