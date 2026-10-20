import { boxToScreen, toScreen, type Viewport } from "../../../platform/viewport";
import type { Track } from "../features/tracker";
import type { Box, PoseResult } from "../models/types";
import { POSE_CONNECTIONS } from "../models/poseConnections";
import type { HudDensity, Overlay } from "../presets";

export interface OverlayVitals {
  bpm: number | null;
  confidence: number;
  elevated: boolean;
  blinksPerMin: number | null;
  gaze: string | null;
  awayPct: number | null;
}

export interface OverlayFrame {
  viewport: Viewport;
  overlays: Set<Overlay>;
  hud: HudDensity;
  pose: PoseResult;
  tracks: Track[];
  scan: { trackId: number | null; progress01: number; centerScan?: boolean };
  vitals: OverlayVitals;
  faceBox: Box | null;
  reticle: boolean;
}

// Line work in bone, live marks in signal red, evidence in amber (see DESIGN.md).
const INK = "#ece6dc";
const INK_DIM = "#9aa3ad";
const SIGNAL = "#ff4433";
const AMBER = "#ffa733";
const FONT = '11px "JetBrains Mono", ui-monospace, monospace';
const FONT_BOLD = 'bold 12px "JetBrains Mono", ui-monospace, monospace';

/** The track whose on-screen box contains (x, y); the smallest wins when boxes overlap. */
export function hitTestTrack(f: OverlayFrame, x: number, y: number): number | null {
  let best: { id: number; area: number } | null = null;
  for (const t of f.tracks) {
    const r = boxToScreen(f.viewport, t.box);
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
    const area = r.w * r.h;
    if (!best || area < best.area) best = { id: t.id, area };
  }
  return best?.id ?? null;
}

/**
 * "ELEVATED" heart rate: above 115% of the person's own baseline, where the
 * baseline is the median of the first 30 s of readings.
 */
export class ElevationTracker {
  private startT: number | null = null;
  private samples: number[] = [];
  private baseline: number | null = null;

  push(tMs: number, bpm: number): void {
    if (this.baseline !== null) return;
    if (this.startT === null) this.startT = tMs;
    this.samples.push(bpm);
    if (tMs - this.startT >= 30_000 && this.samples.length >= 10) {
      const s = [...this.samples].sort((a, b) => a - b);
      this.baseline = s[s.length >> 1];
    }
  }

  elevated(bpm: number): boolean {
    return this.baseline !== null && bpm > this.baseline * 1.15;
  }

  reset(): void {
    this.startT = null;
    this.samples = [];
    this.baseline = null;
  }
}

/** Draws the vector HUD layer (skeleton, evidence brackets, reticle, scan ring, vitals). */
export function drawOverlay(ctx: CanvasRenderingContext2D, f: OverlayFrame): void {
  const v = f.viewport;
  ctx.clearRect(0, 0, v.dstW, v.dstH);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (f.hud !== "off") {
    if (f.overlays.has("skeleton") && f.pose) drawSkeleton(ctx, v, f.pose);
    if (f.overlays.has("evidence")) {
      for (const t of f.tracks) drawEvidence(ctx, v, t, f.hud === "full", t.id === f.scan.trackId);
    }
    if (f.reticle) drawReticle(ctx, v);
    if (f.overlays.has("vitals")) drawVitals(ctx, v, f.vitals, f.faceBox, f.hud === "full");
  }
  drawScanRing(ctx, f);
}

function drawSkeleton(ctx: CanvasRenderingContext2D, v: Viewport, pose: NonNullable<PoseResult>) {
  const lm = pose.landmarks;
  const vis = (i: number) => (lm[i]?.visibility ?? 1) > 0.5;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.shadowColor = INK;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (const [a, b] of POSE_CONNECTIONS) {
    if (!vis(a) || !vis(b)) continue;
    const p = toScreen(v, lm[a].x, lm[a].y);
    const q = toScreen(v, lm[b].x, lm[b].y);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
  ctx.fillStyle = INK;
  for (let i = 11; i < lm.length; i++) {
    if (!vis(i)) continue;
    const p = toScreen(v, lm[i].x, lm[i].y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawEvidence(ctx: CanvasRenderingContext2D, v: Viewport, t: Track, labels: boolean, targeted: boolean) {
  const r = boxToScreen(v, t.box);
  const c = Math.min(18, r.w / 4, r.h / 4);
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = targeted ? 3 : 2;
  ctx.shadowColor = AMBER;
  ctx.shadowBlur = targeted ? 14 : 6;
  ctx.beginPath();
  for (const [x, y, dx, dy] of [
    [r.x, r.y, 1, 1],
    [r.x + r.w, r.y, -1, 1],
    [r.x, r.y + r.h, 1, -1],
    [r.x + r.w, r.y + r.h, -1, -1],
  ]) {
    ctx.moveTo(x + dx * c, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * c);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  const text = labels ? `${t.tag} · ${t.label.toUpperCase()} ${Math.round(t.score * 100)}%` : t.tag;
  ctx.font = FONT;
  const tw = ctx.measureText(text).width;
  const ty = r.y > 22 ? r.y - 8 : r.y + r.h + 16;
  ctx.fillStyle = "rgba(4,5,7,0.8)";
  ctx.fillRect(r.x - 2, ty - 12, tw + 8, 16);
  ctx.fillStyle = AMBER;
  ctx.fillText(text, r.x + 2, ty);
}

function drawReticle(ctx: CanvasRenderingContext2D, v: Viewport) {
  const cx = v.dstW / 2;
  const cy = v.dstH / 2;
  ctx.strokeStyle = "rgba(255,68,51,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    ctx.moveTo(cx + dx * 18, cy + dy * 18);
    ctx.lineTo(cx + dx * 36, cy + dy * 36);
  }
  ctx.stroke();
}

function drawScanRing(ctx: CanvasRenderingContext2D, f: OverlayFrame) {
  const { progress01, trackId, centerScan } = f.scan;
  if (progress01 <= 0) return;
  const v = f.viewport;
  let cx = v.dstW / 2;
  let cy = v.dstH / 2;
  let rad = 46;
  const t = trackId !== null && !centerScan ? f.tracks.find((x) => x.id === trackId) : undefined;
  if (t) {
    const r = boxToScreen(v, t.box);
    cx = r.x + r.w / 2;
    cy = r.y + r.h / 2;
    rad = Math.max(r.w, r.h) / 2 + 12;
  }
  ctx.strokeStyle = SIGNAL;
  ctx.lineWidth = 3;
  ctx.shadowColor = SIGNAL;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress01));
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = FONT_BOLD;
  ctx.fillStyle = SIGNAL;
  const label = progress01 >= 1 ? "ANALYZING…" : "SCANNING";
  ctx.fillText(label, cx - ctx.measureText(label).width / 2, cy + rad + 18);
}

function drawVitals(ctx: CanvasRenderingContext2D, v: Viewport, vit: OverlayVitals, face: Box | null, full: boolean) {
  const lines: Array<{ text: string; color?: string; bar?: number }> = [
    { text: `HR    ${vit.bpm !== null ? Math.round(vit.bpm) : "--"} BPM${full ? " · EST" : ""}`, bar: vit.bpm !== null ? vit.confidence : undefined },
  ];
  if (vit.bpm !== null && vit.elevated) lines.push({ text: "ELEVATED", color: AMBER });
  lines.push({ text: `BLINK ${vit.blinksPerMin ?? "--"}/MIN` });
  lines.push({ text: `GAZE  ${(vit.gaze ?? "--").toUpperCase()}${vit.awayPct !== null ? ` · AWAY ${Math.round(vit.awayPct)}%` : ""}` });

  ctx.font = FONT;
  const w = Math.max(...lines.map((l) => ctx.measureText(l.text).width)) + 20;
  const h = lines.length * 17 + 12;
  let x = v.dstW - w - 20;
  let y = 90;
  if (face) {
    const r = boxToScreen(v, face);
    x = r.x + r.w + 16;
    if (x + w > v.dstW - 8) x = r.x - w - 16;
    y = Math.max(8, Math.min(v.dstH - h - 8, r.y));
    x = Math.max(8, x);
    // leader line from the face to the panel
    ctx.strokeStyle = INK_DIM;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x < r.x ? r.x : r.x + r.w, r.y + r.h * 0.3);
    ctx.lineTo(x < r.x ? x + w : x, y + 12);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(4,5,7,0.82)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = INK_DIM;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  lines.forEach((l, i) => {
    const ly = y + 20 + i * 17;
    ctx.fillStyle = l.color ?? INK;
    ctx.fillText(l.text, x + 10, ly);
    if (l.bar !== undefined) {
      const bw = 40;
      const bx = x + w - bw - 10;
      ctx.fillStyle = "rgba(255,68,51,0.25)";
      ctx.fillRect(bx, ly - 7, bw, 4);
      ctx.fillStyle = SIGNAL;
      ctx.fillRect(bx, ly - 7, bw * Math.min(1, l.bar), 4);
    }
  });
}
