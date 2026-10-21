import { decodeImage, encodeImage } from "../imagekit/decode";
import { makePixels, type Pixels } from "../imagekit/pixels";
import { mulberry32 } from "../imagekit/rng";

const W = 512;
const H = 384;
const WALL_TOP = 190;
const CLONE = { x: 120, y: 200, w: 64, h: 64, dx: 96, dy: 40 };
/** On the wall, left of the clone; 20 and 284 are both 4 mod 8, so the patch's own grid is off the photo's. */
const PASTE = { x: 20, y: 284, w: 72, h: 72 };

type Rect = { x: number; y: number; w: number; h: number };

function setRgb(p: Pixels, x: number, y: number, r: number, g: number, b: number) {
  p.data.set([r, g, b, 255], (y * p.width + x) * 4);
}

/** Dusk sky, brightest at the horizon, with a little grain so it recompresses like a real photo. */
function paintSky(p: Pixels, rand: () => number) {
  for (let y = 0; y < H; y++) {
    const t = y / WALL_TOP;
    for (let x = 0; x < W; x++) {
      const n = (rand() - 0.5) * 5;
      setRgb(p, x, y, 70 + 120 * t + n, 100 + 90 * t + n, 150 + 50 * t + n);
    }
  }
}

/**
 * Courses of stone, each stone with its own tone, mortar lines between, and
 * per-pixel grain so no two 8x8 blocks look alike. `inside` limits the area;
 * `tint` darkens the tower against the wall.
 */
function paintStone(p: Pixels, rand: () => number, area: Rect, tint: number, inside: (x: number, y: number) => boolean) {
  const course = 16;
  for (let cy = area.y; cy < area.y + area.h; cy += course) {
    let x = area.x - Math.floor(rand() * 24);
    while (x < area.x + area.w) {
      const sw = 24 + Math.floor(rand() * 20);
      const tone = (95 + rand() * 60) * tint;
      const warm = rand() * 14;
      for (let y = cy; y < Math.min(cy + course, area.y + area.h); y++) {
        for (let sx = x; sx < x + sw; sx++) {
          if (sx < area.x || sx >= area.x + area.w || !inside(sx, y)) continue;
          const mortar = y === cy || sx === x;
          const g = mortar ? -38 : (rand() - 0.5) * 34;
          setRgb(p, sx, y, tone + warm * 0.6 + g, tone + g, tone - warm + g);
        }
      }
      x += sw;
    }
  }
}

function paintTower(p: Pixels, rand: () => number) {
  const left = 330;
  const right = 410;
  const top = 80;
  const apex = { x: 370, y: 24 };
  const inRoof = (x: number, y: number) => {
    if (y < apex.y || y >= top) return false;
    const half = ((y - apex.y) / (top - apex.y)) * (right + 10 - left) * 0.5;
    return Math.abs(x - (left + right) / 2) <= half;
  };
  paintStone(p, rand, { x: left, y: top, w: right - left, h: H - top }, 0.7, () => true);
  // Slate roof, flat dark with a faint grain.
  for (let y = apex.y; y < top; y++) {
    for (let x = left - 10; x < right + 10; x++) {
      if (inRoof(x, y)) {
        const n = (rand() - 0.5) * 8;
        setRgb(p, x, y, 38 + n, 44 + n, 58 + n);
      }
    }
  }
  // The belfry opening, and a bell hanging in it.
  for (let y = 100; y < 142; y++) {
    for (let x = 358; x < 382; x++) {
      const arch = y >= 112 || Math.hypot(x - 369.5, y - 112) <= 12;
      if (arch) setRgb(p, x, y, 18, 20, 28);
    }
  }
  for (let y = 116; y < 136; y++) {
    const half = 3 + (y - 116) * 0.4;
    for (let x = Math.round(369.5 - half); x <= Math.round(369.5 + half); x++) setRgb(p, x, y, 150, 120, 60);
  }
}

/** Copies a rectangle within `p`; the rectangles must not overlap. */
function copyRect(p: Pixels, from: Rect, dx: number, dy: number) {
  for (let y = 0; y < from.h; y++) {
    const s = ((from.y + y) * p.width + from.x) * 4;
    p.data.copyWithin(((from.y + y + dy) * p.width + from.x + dx) * 4, s, s + from.w * 4);
  }
}

/**
 * The demo scene: a bell tower at dusk, 512x384. A textured 64x64 patch of the
 * wall is cloned elsewhere on the wall (copy-move finds it), and `pasted` marks
 * a 72x72 rectangle of the wall, clear of the clone's source and destination,
 * that `makeForensicsDemo` recompresses at a different quality on its own grid.
 */
export function forensicsDemoPixels(seed = 7): {
  pixels: Pixels;
  cloned: { x: number; y: number; w: number; h: number; dx: number; dy: number };
  pasted: { x: number; y: number; w: number; h: number };
} {
  const rand = mulberry32(seed);
  const pixels = makePixels(W, H);
  paintSky(pixels, rand);
  paintStone(pixels, rand, { x: 0, y: WALL_TOP, w: W, h: H - WALL_TOP }, 1, () => true);
  paintTower(pixels, rand);
  copyRect(pixels, CLONE, CLONE.dx, CLONE.dy);
  return { pixels, cloned: { ...CLONE }, pasted: { ...PASTE } };
}

/** Saves `p` as a JPEG at `quality` and decodes it again (browser only). */
async function jpegRoundTrip(p: Pixels, quality: number): Promise<Pixels> {
  return decodeImage(new Blob([(await encodeImage(p, "image/jpeg", quality)) as BlobPart], { type: "image/jpeg" }));
}

/**
 * The demo photo as JPEG bytes (browser only), saved three times (Ruling R14):
 * - The whole scene at 0.5 first, so the final file is a second compression
 *   on the same 8x8 grid and the double-quantization panel fires.
 * - The pasted rectangle, cut from the original scene and saved on its own at
 *   0.6, then written back at (20, 284) on the stone wall. Its 8x8 grid is off
 *   the photo's (both offsets are 4 mod 8) and its texture keeps that save's
 *   errors, so it stands out in error level analysis.
 * - The whole image at 0.75, coarse enough that the 0.9 re-save of error level
 *   analysis leaves the background quiet. The clone is grid-aligned (every
 *   offset is a multiple of 8), so copy-move still finds it after both saves.
 */
export async function makeForensicsDemo(): Promise<{ bytes: Uint8Array; mime: "image/jpeg"; title: "Demo photo — bell tower" }> {
  const { pixels: scene, pasted } = forensicsDemoPixels();
  const pixels = await jpegRoundTrip(scene, 0.5);
  const crop = makePixels(pasted.w, pasted.h);
  for (let y = 0; y < pasted.h; y++) {
    const s = ((pasted.y + y) * W + pasted.x) * 4;
    crop.data.set(scene.data.subarray(s, s + pasted.w * 4), y * pasted.w * 4);
  }
  const low = await jpegRoundTrip(crop, 0.6);
  for (let y = 0; y < pasted.h; y++) {
    pixels.data.set(low.data.subarray(y * pasted.w * 4, (y + 1) * pasted.w * 4), ((pasted.y + y) * W + pasted.x) * 4);
  }
  return { bytes: await encodeImage(pixels, "image/jpeg", 0.75), mime: "image/jpeg", title: "Demo photo — bell tower" };
}
