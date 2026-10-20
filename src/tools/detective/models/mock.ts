import type { ModelName } from "../presets";
import type { Box, DepthMap, Detection, FaceResult, Landmark, Mask, ModelAdapter, PoseResult } from "./types";

/** Heart rate the mock face "has" (the fake camera carries no real pulse). */
export const MOCK_PULSE_BPM = 72;

const MASK_W = 160;
const MASK_H = 120;

/** Horizontal sway of the mock person, in normalized x. */
const sway = (t: number) => 0.5 + 0.08 * Math.sin((t / 1000) * 0.8);

function mask(t: number): Mask {
  const cx = sway(t);
  const data = new Float32Array(MASK_W * MASK_H);
  for (let y = 0; y < MASK_H; y++) {
    for (let x = 0; x < MASK_W; x++) {
      const nx = x / MASK_W;
      const ny = y / MASK_H;
      // head + body
      const head = ((nx - cx) / 0.07) ** 2 + ((ny - 0.27) / 0.1) ** 2 < 1;
      const body = ((nx - cx) / 0.16) ** 2 + ((ny - 0.72) / 0.36) ** 2 < 1;
      data[y * MASK_W + x] = head || body ? 1 : 0;
    }
  }
  return { data, width: MASK_W, height: MASK_H };
}

function pose(t: number): PoseResult {
  const cx = sway(t);
  const swing = 0.06 * Math.sin((t / 1000) * 3);
  const p = (x: number, y: number, visibility = 0.95): Landmark => ({ x: cx + x, y, z: 0, visibility });
  const lm: Landmark[] = new Array(33).fill(null).map(() => p(0, 0.27));
  // face points 0-10 cluster around the head
  for (let i = 0; i <= 10; i++) lm[i] = p((i % 5) * 0.01 - 0.02, 0.25 + Math.floor(i / 5) * 0.02);
  lm[11] = p(0.09, 0.42); // left shoulder (subject's left = image right)
  lm[12] = p(-0.09, 0.42);
  lm[13] = p(0.13, 0.58 + swing); // elbows
  lm[14] = p(-0.13, 0.58 - swing);
  lm[15] = p(0.14 + swing, 0.72); // wrists
  lm[16] = p(-0.14 - swing, 0.72);
  for (const [i, s] of [[17, 1], [19, 1], [21, 1], [18, -1], [20, -1], [22, -1]] as const) {
    lm[i] = p(s * 0.15 + s * swing, 0.75);
  }
  lm[23] = p(0.06, 0.78); // hips
  lm[24] = p(-0.06, 0.78);
  lm[25] = p(0.07, 0.95, 0.5); // knees, partly out of frame
  lm[26] = p(-0.07, 0.95, 0.5);
  for (let i = 27; i < 33; i++) lm[i] = p(i % 2 ? 0.07 : -0.07, 1.05, 0.1);
  return { landmarks: lm };
}

/** Cup drifts right then back on a 20 s cycle; its box covers the center for t ∈ (2 s, 8 s) and (12 s, 18 s). */
function detections(t: number): Detection[] {
  const s = (t / 1000) % 20;
  const speed = 0.07 / 3;
  const cupX = s < 10 ? 0.5 + speed * (s - 5) : 0.5 - speed * (s - 15);
  const cup: Box = [cupX - 0.07, 0.42, cupX + 0.07, 0.58];
  const wob = 0.01 * Math.sin(t / 700);
  const phone: Box = [0.14 + wob, 0.7, 0.26 + wob, 0.84];
  return [
    { label: "cup", score: 0.86, box: cup },
    { label: "cell phone", score: 0.74, box: phone },
  ];
}

function face(t: number): FaceResult {
  const cx = sway(t);
  const cy = 0.27;
  const closed = t % 3000 >= 2850; // 150 ms blink every 3 s
  const lookLeft = t % 7000 >= 6000; // 1 s glance every 7 s
  const lm: Landmark[] = new Array(478).fill(null).map(() => ({ x: cx, y: cy, z: 0 }));
  const set = (i: number, x: number, y: number) => (lm[i] = { x: cx + x, y: cy + y, z: 0 });
  const open = closed ? 0.002 : 0.012;
  // eyes: [outer corner, upper1, upper2, inner corner, lower2, lower1] per Face Landmarker indices
  const eye = (idx: number[], ex: number) => {
    const [c1, u1, u2, c2, l2, l1] = idx;
    set(c1, ex - 0.02, -0.03);
    set(u1, ex - 0.007, -0.03 - open);
    set(u2, ex + 0.007, -0.03 - open);
    set(c2, ex + 0.02, -0.03);
    set(l2, ex + 0.007, -0.03 + open);
    set(l1, ex - 0.007, -0.03 + open);
  };
  eye([33, 160, 158, 133, 153, 144], -0.035);
  eye([362, 385, 387, 263, 373, 380], 0.035);
  const irisDx = lookLeft ? -0.012 : 0;
  set(468, -0.035 + irisDx, -0.03);
  set(473, 0.035 + irisDx, -0.03);
  // forehead / cheeks for the heart-rate regions
  set(10, 0, -0.09);
  set(151, 0, -0.07);
  set(234, -0.06, 0.0);
  set(454, 0.06, 0.0);
  set(152, 0, 0.09);
  return { landmarks: lm, box: [cx - 0.065, cy - 0.1, cx + 0.065, cy + 0.1] };
}

function depth(): DepthMap {
  const w = 128;
  const h = 96;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = Math.round(60 + (195 * x) / (w - 1));
  return { data, width: w, height: h };
}

const adapter = <T,>(name: ModelName, fn: (t: number) => T, loadMs = 200): ModelAdapter<T> => ({
  name,
  load: () => new Promise((r) => setTimeout(r, loadMs)),
  infer: (_v, t) => fn(t),
  dispose: () => {},
});

/** Deterministic stand-ins for every model, used with `?mock`. */
export function createMockAdapters(): Record<ModelName, ModelAdapter<unknown>> {
  return {
    segmentation: adapter("segmentation", mask, 0),
    pose: adapter("pose", pose, 0),
    detection: adapter("detection", detections, 0),
    face: adapter("face", face, 0),
    depth: adapter("depth", depth, 0),
  };
}
