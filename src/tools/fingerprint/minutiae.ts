export interface Minutia {
  x: number;
  y: number;
  /** Radians in (-pi, pi]. */
  angle: number;
  kind: "ending" | "bifurcation";
}

const BLOCK = 16;
/** How far along a ridge the direction is traced, px. */
const TRACE = 8;
/** Minutiae this close to the mask border or the image edge are dropped, px. */
const BORDER = 10;
/** Minutiae closer than this to another one are both dropped, px. */
const PAIR_GAP = 6;

/** The 8 neighbours clockwise from north: P2..P9 of Zhang-Suen. */
const DX = [0, 1, 1, 1, 0, -1, -1, -1];
const DY = [-1, -1, 0, 1, 1, 1, 0, -1];

/** Normalises to (-pi, pi]. */
function wrap(a: number): number {
  let t = a % (2 * Math.PI);
  if (t > Math.PI) t -= 2 * Math.PI;
  if (t <= -Math.PI) t += 2 * Math.PI;
  return t;
}

/** True when (x, y) is within BORDER px of the image edge or of a pixel whose block is masked out. */
function nearBorder(x: number, y: number, mask: Uint8Array, bw: number, bh: number): boolean {
  const lo = (v: number) => Math.floor((v - BORDER) / BLOCK);
  const hi = (v: number) => Math.floor((v + BORDER) / BLOCK);
  for (let by = lo(y); by <= hi(y); by++) {
    for (let bx = lo(x); bx <= hi(x); bx++) {
      // Blocks off the grid (the image edge, and the strip past the last whole block) count as masked out.
      if (bx >= 0 && by >= 0 && bx < bw && by < bh && mask[by * bw + bx]) continue;
      const nx = Math.max(bx * BLOCK - x, 0, x - (bx * BLOCK + BLOCK - 1));
      const ny = Math.max(by * BLOCK - y, 0, y - (by * BLOCK + BLOCK - 1));
      if (Math.hypot(nx, ny) <= BORDER) return true;
    }
  }
  return false;
}

/**
 * Walks up to TRACE pixels along the skeleton from `start`, never revisiting a
 * pixel in `seen`, and returns the vector from the origin pixel to where it stopped.
 */
function trace(
  skel: Uint8Array,
  w: number,
  h: number,
  ox: number,
  oy: number,
  start: number,
  seen: Set<number>,
): [number, number] {
  let cur = start;
  for (let step = 0; step < TRACE; step++) {
    seen.add(cur);
    const cx = cur % w;
    const cy = (cur - cx) / w;
    let next = -1;
    for (let k = 0; k < 8; k++) {
      const x = cx + DX[k];
      const y = cy + DY[k];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x;
      if (skel[j] && !seen.has(j)) {
        next = j;
        // Prefer a straight (4-connected) step so a staircase is not walked twice.
        if (k % 2 === 0) break;
      }
    }
    if (next < 0) break;
    cur = next;
  }
  return [(cur % w) - ox, Math.floor(cur / w) - oy];
}

/**
 * Crossing-number minutiae of a one-pixel skeleton (1 = ridge): CN = 1/2 sum of
 * |P(i) - P(i+1)| over the 8 neighbours, 1 an ending, 3 a bifurcation.
 *
 * Angles are in radians in (-pi, pi] with screen y pointing down. An ending's
 * angle is the direction its ridge is traced (8 px) turned half a circle, so it
 * points out of the ridge, away from it. A bifurcation has three branches; the
 * angle is the mean direction of the two that run most nearly parallel, so it
 * points down the fork, away from the stem.
 *
 * `mask` is per 16 px block (`bw` blocks across). Minutiae within 10 px of the
 * image edge or of any masked-out block are dropped, then both members of every
 * pair closer than 6 px.
 */
export function extractMinutiae(skel: Uint8Array, w: number, h: number, mask: Uint8Array, bw: number): Minutia[] {
  const bh = Math.floor(mask.length / bw);
  const found: Minutia[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!skel[i]) continue;
      const ring: number[] = [];
      for (let k = 0; k < 8; k++) ring.push(skel[(y + DY[k]) * w + x + DX[k]]);
      let crossings = 0;
      for (let k = 0; k < 8; k++) crossings += Math.abs(ring[k] - ring[(k + 1) % 8]);
      const cn = crossings / 2;
      if (cn !== 1 && cn !== 3) continue;
      if (nearBorder(x, y, mask, bw, bh)) continue;

      // One starting pixel per run of neighbours; the rest of the ring is off limits while tracing.
      const starts: number[] = [];
      for (let k = 0; k < 8; k++) {
        if (ring[k] && !ring[(k + 7) % 8]) starts.push(k);
      }
      const ringPixels = new Set<number>();
      for (let k = 0; k < 8; k++) if (ring[k]) ringPixels.add((y + DY[k]) * w + x + DX[k]);
      const dirs = starts.map((k) => {
        const seen = new Set<number>([i, ...ringPixels]);
        const [vx, vy] = trace(skel, w, h, x, y, (y + DY[k]) * w + x + DX[k], seen);
        return Math.atan2(vy, vx);
      });

      if (cn === 1) {
        found.push({ x, y, angle: wrap(dirs[0] + Math.PI), kind: "ending" });
      } else if (dirs.length === 3) {
        // The two branches with the smallest gap between them; their mean points down the fork.
        let best = [0, 1];
        let gap = Infinity;
        for (let a = 0; a < 3; a++) {
          for (let b = a + 1; b < 3; b++) {
            const g = Math.abs(wrap(dirs[a] - dirs[b]));
            if (g < gap) {
              gap = g;
              best = [a, b];
            }
          }
        }
        const angle = Math.atan2(
          Math.sin(dirs[best[0]]) + Math.sin(dirs[best[1]]),
          Math.cos(dirs[best[0]]) + Math.cos(dirs[best[1]]),
        );
        found.push({ x, y, angle, kind: "bifurcation" });
      }
    }
  }
  return found.filter((m, i) => found.every((o, j) => i === j || Math.hypot(o.x - m.x, o.y - m.y) >= PAIR_GAP));
}
