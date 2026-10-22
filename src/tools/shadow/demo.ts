import { encodeImage } from "../imagekit/decode";
import type { Pixels } from "../imagekit/pixels";
import { mulberry32 } from "../imagekit/rng";
import { normalizeBearing, type Pt } from "./shadow";
import { solarPosition } from "./solar";

/** Where and when the demo photo was "taken" (the plan's demo truth). */
export const DEMO_TRUTH = { lat: 51.5, lon: -0.12, timeUtc: "2026-06-21T14:00:00Z" };

const W = 640;
const H = 480;
const HORIZON = 250;
const POLE_PX = 200;
const BASE: Pt = { x: 230, y: 410 };
/** The shadow's direction across the picture, below horizontal: a pavement seen a little from above. */
const SHADOW_SLANT_DEG = 9;
const SEED = 47;

export type Marks = { base: Pt; top: Pt; tip: Pt };
export interface ShadowDemo {
  marks: Marks;
  timeUtc: string;
  bearingDeg: number;
}

/** The demo's marks, time and bearing: a 200 px pole and the shadow the sun casts at the demo truth. */
export function shadowDemoScene(): ShadowDemo {
  const sun = solarPosition(new Date(DEMO_TRUTH.timeUtc), DEMO_TRUTH.lat, DEMO_TRUTH.lon);
  // the photo shows the apparent sun, refraction and all
  const shadowPx = POLE_PX / Math.tan((sun.elevationDeg * Math.PI) / 180);
  const slant = (SHADOW_SLANT_DEG * Math.PI) / 180;
  return {
    marks: {
      base: BASE,
      top: { x: BASE.x, y: BASE.y - POLE_PX },
      tip: { x: BASE.x + shadowPx * Math.cos(slant), y: BASE.y + shadowPx * Math.sin(slant) },
    },
    timeUtc: DEMO_TRUTH.timeUtc,
    // the shadow points away from the sun; to 0.1 degrees, as someone would read it off a compass
    bearingDeg: Math.round(normalizeBearing(sun.azimuthDeg + 180) * 10) / 10,
  };
}

/** Distance from p to the segment ab, in pixels. */
function segmentDistance(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/** Coverage of a pixel by a stroke of half-width r about ab, softened over one pixel. */
const stroke = (x: number, y: number, a: Pt, b: Pt, r: number) => Math.max(0, Math.min(1, r + 0.5 - segmentDistance(x + 0.5, y + 0.5, a, b)));

/**
 * The demo photo: a sky over a paved square, a lamp post 200 px tall and its shadow, drawn so
 * the shadow's length is the one the sun casts at the demo truth. The marks sit on the drawn
 * base, top and tip.
 */
export function shadowDemoPixels(scene = shadowDemoScene()): Pixels {
  const { base, top, tip } = scene.marks;
  const rand = mulberry32(SEED);
  const data = new Uint8ClampedArray(W * H * 4);
  // the lantern: a short wider block just under the top of the post, and its shadow near the tip
  const lanternTop = { x: top.x, y: top.y + 3 };
  const lanternFoot = { x: top.x, y: top.y + 16 };
  const along = (f: number) => ({ x: base.x + (tip.x - base.x) * f, y: base.y + (tip.y - base.y) * f });

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = (rand() - 0.5) * 8;
      let rgb: [number, number, number];
      if (y < HORIZON) {
        // a clear afternoon sky, paler towards the horizon
        const f = y / HORIZON;
        rgb = [118 + 80 * f + n, 160 + 58 * f + n, 214 + 26 * f + n];
      } else {
        // paving, lighter with distance, with faint joints every 40 px
        const f = (y - HORIZON) / (H - HORIZON);
        const joint = (x + Math.round((y - HORIZON) * 0.4)) % 40 === 0 || (y - HORIZON) % 24 === 0 ? -14 : 0;
        const v = 176 - 30 * f + joint + n;
        rgb = [v, v - 4, v - 12];
      }
      if (y >= HORIZON) {
        // the shadow: the post's and then the lantern's, darkening the paving
        const s = Math.max(stroke(x, y, base, tip, 3), stroke(x, y, along(0.92), along(0.995), 6));
        rgb = rgb.map((c) => c * (1 - 0.48 * s)) as typeof rgb;
      }
      // the post over everything, dark green-grey, with the lantern on top
      const post = Math.max(stroke(x, y, base, top, 3), stroke(x, y, lanternTop, lanternFoot, 7));
      if (post > 0) rgb = rgb.map((c, i) => c * (1 - post) + [44, 52, 48][i] * post) as typeof rgb;
      data.set([rgb[0], rgb[1], rgb[2], 255], (y * W + x) * 4);
    }
  }
  return { width: W, height: H, data };
}

/** The demo photo (browser only), with its marks, time and bearing staged on the exhibit. */
export async function makeShadowDemo(): Promise<{
  bytes: Uint8Array;
  mime: "image/png";
  title: "Demo photo — lamp post";
  meta: { shadowDemo: ShadowDemo };
}> {
  const scene = shadowDemoScene();
  return {
    bytes: await encodeImage(shadowDemoPixels(scene), "image/png"),
    mime: "image/png",
    title: "Demo photo — lamp post",
    meta: { shadowDemo: scene },
  };
}

const isPt = (p: unknown): p is Pt =>
  !!p && typeof p === "object" && Number.isFinite((p as Pt).x) && Number.isFinite((p as Pt).y);

/** The staged demo on an exhibit's meta, validated: anything malformed (an imported file) reads as none. */
export function readShadowDemo(meta: Record<string, unknown> | undefined): ShadowDemo | null {
  const d = meta?.shadowDemo as Partial<ShadowDemo> | undefined;
  if (!d || typeof d !== "object" || !d.marks) return null;
  const { base, top, tip } = d.marks;
  if (!isPt(base) || !isPt(top) || !isPt(tip)) return null;
  if (typeof d.timeUtc !== "string" || !Number.isFinite(new Date(d.timeUtc).getTime())) return null;
  if (!Number.isFinite(d.bearingDeg)) return null;
  return { marks: { base, top, tip }, timeUtc: d.timeUtc, bearingDeg: d.bearingDeg! };
}
