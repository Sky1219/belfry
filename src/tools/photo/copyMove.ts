import type { FindingDetail } from "../../store/schema";
import { ZIGZAG } from "../../platform/math/dct8";
import { makePixels, type Pixels } from "../imagekit/pixels";
import { verdictFor, verdictTitle } from "../imagekit/verdict";

export interface CopyMoveResult {
  width: number;
  height: number;
  /** The most common displacement between matching blocks, dx > 0 (or dx = 0 and dy > 0); null when nothing matched. */
  shift: { dx: number; dy: number } | null;
  /** Block pairs that match at `shift`. */
  blocks: number;
  /** Blocks textured enough to compare (variance at least MIN_VARIANCE). */
  considered: number;
  /** 1 where a matched block (source or copy) covers the pixel; width x height. */
  mask: Uint8Array;
}

const BLOCK = 8;
const COEFFS = 9;
const MIN_VARIANCE = 25;
const QUANT = 2.5;
const WINDOW = 10;
const MIN_SHIFT = 16;
const MIN_CONSIDERED = 64;

/** BASIS_2D[z * 64 + y * 8 + x]: weight of pixel (x, y) in the z-th zigzag DCT-II coefficient (orthonormal). */
const BASIS_2D = (() => {
  const b = (u: number, x: number) => ((u === 0 ? Math.SQRT1_2 : 1) / 2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  const t = new Float64Array(COEFFS * 64);
  for (let z = 0; z < COEFFS; z++) {
    const u = ZIGZAG[z] >> 3;
    const v = ZIGZAG[z] & 7;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) t[z * 64 + y * 8 + x] = b(u, y) * b(v, x);
  }
  return t;
})();

/**
 * Finds regions copied within one grayscale image. Every 8x8 block (stride 1)
 * with some texture is reduced to its first 9 DCT coefficients, rounded to
 * steps of 2.5. Blocks are sorted by that feature; equal neighbours in the
 * sorted order are copies of each other, and the displacement most of them
 * share is the copy-move shift.
 */
export function detectCopyMove(gray: Float32Array, w: number, h: number): CopyMoveResult {
  const mask = new Uint8Array(w * h);
  const bw = w - BLOCK + 1;
  const bh = h - BLOCK + 1;
  if (bw <= 0 || bh <= 0) return { width: w, height: h, shift: null, blocks: 0, considered: 0, mask };

  const pos: number[] = []; // top-left pixel index of each textured block
  const feat = new Int16Array(bw * bh * COEFFS);
  const px = new Float64Array(64);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sum = 0;
      let sq = 0;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const v = gray[(by + y) * w + bx + x];
          px[y * 8 + x] = v;
          sum += v;
          sq += v * v;
        }
      }
      const mean = sum / 64;
      if (sq / 64 - mean * mean < MIN_VARIANCE) continue;
      const at = pos.length * COEFFS;
      for (let z = 0; z < COEFFS; z++) {
        let c = 0;
        for (let i = 0; i < 64; i++) c += px[i] * BASIS_2D[z * 64 + i];
        feat[at + z] = Math.round(c / QUANT);
      }
      pos.push(by * w + bx);
    }
  }

  const n = pos.length;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => {
    for (let z = 0; z < COEFFS; z++) {
      const d = feat[a * COEFFS + z] - feat[b * COEFFS + z];
      if (d !== 0) return d;
    }
    return a - b;
  });

  const sameFeature = (a: number, b: number) => {
    for (let z = 0; z < COEFFS; z++) if (feat[a * COEFFS + z] !== feat[b * COEFFS + z]) return false;
    return true;
  };
  /** Calls `visit` for each matching pair whose displacement is long enough, with dx > 0 (or dx = 0, dy > 0). */
  const eachPair = (visit: (from: number, to: number, dx: number, dy: number) => void) => {
    for (let i = 0; i < n; i++) {
      const a = order[i];
      for (let j = i + 1; j <= i + WINDOW && j < n; j++) {
        const b = order[j];
        if (!sameFeature(a, b)) break;
        let dx = (pos[b] % w) - (pos[a] % w);
        let dy = Math.floor(pos[b] / w) - Math.floor(pos[a] / w);
        if (dx * dx + dy * dy < MIN_SHIFT * MIN_SHIFT) continue;
        const swap = dx < 0 || (dx === 0 && dy < 0);
        if (swap) {
          dx = -dx;
          dy = -dy;
        }
        visit(swap ? b : a, swap ? a : b, dx, dy);
      }
    }
  };

  const votes = new Map<number, number>();
  const KEY = 1 << 16; // dy is in (-h, h); offset it into a positive range
  eachPair((_f, _t, dx, dy) => {
    const key = dx * KEY + (dy + KEY / 2);
    votes.set(key, (votes.get(key) ?? 0) + 1);
  });

  let bestKey = -1;
  let blocks = 0;
  for (const [key, count] of votes) {
    if (count > blocks || (count === blocks && key < bestKey)) {
      bestKey = key;
      blocks = count;
    }
  }
  if (bestKey < 0) return { width: w, height: h, shift: null, blocks: 0, considered: n, mask };

  const shift = { dx: Math.floor(bestKey / KEY), dy: (bestKey % KEY) - KEY / 2 };
  const paint = (p: number) => {
    for (let y = 0; y < 8; y++) mask.fill(1, p + y * w, p + y * w + 8);
  };
  eachPair((from, to, dx, dy) => {
    if (dx !== shift.dx || dy !== shift.dy) return;
    paint(pos[from]);
    paint(pos[to]);
  });
  return { width: w, height: h, shift, blocks, considered: n, mask };
}

const AMBER = [255, 167, 51] as const; // #ffa733

/**
 * The photo with the copy-move mask (mw x mh, any scale) laid over it: matched
 * pixels washed amber, the rest dimmed, so the cloned regions read on the board.
 * The mask is sampled nearest-neighbour at the photo's own size.
 */
export function markRegions(photo: Pixels, mask: Uint8Array, mw: number, mh: number): Pixels {
  const { width: w, height: h } = photo;
  const out = makePixels(w, h);
  for (let y = 0; y < h; y++) {
    const my = Math.min(mh - 1, Math.floor((y * mh) / h));
    for (let x = 0; x < w; x++) {
      const mx = Math.min(mw - 1, Math.floor((x * mw) / w));
      const i = (y * w + x) * 4;
      const on = mask[my * mw + mx] === 1;
      for (let c = 0; c < 3; c++) out.data[i + c] = on ? photo.data[i + c] * 0.45 + AMBER[c] * 0.55 : photo.data[i + c] * 0.4;
      out.data[i + 3] = 255;
    }
  }
  return out;
}

const THRESHOLDS = { inconclusiveAt: 15, consistentAt: 40 };
const LIMIT = "Repeating textures (brick, tiles, foliage) can match themselves.";

/** The copy-move finding. Too few textured blocks to compare reads inconclusive, whatever the match count. */
export function copyMoveFinding(r: CopyMoveResult): { title: string; body: string; detail?: FindingDetail } {
  if (r.considered < MIN_CONSIDERED) {
    return {
      title: verdictTitle("Copy-move", "inconclusive", "cloned regions"),
      body: `The image has too little texture to compare: only ${r.considered} 8×8 blocks varied enough. ${LIMIT}`,
    };
  }
  const at = r.shift ? ` The most common displacement is (${r.shift.dx}, ${r.shift.dy}) px.` : "";
  return {
    title: verdictTitle("Copy-move", verdictFor(r.blocks, THRESHOLDS), "cloned regions"),
    body: `${r.blocks} matching 8×8 blocks.${at} Consistent at 40 or more, inconclusive from 15 to 39. ${LIMIT}`,
    detail: { kind: "measurement", value: r.blocks, unit: "matching blocks" },
  };
}
