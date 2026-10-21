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
/** How far the branches of a bifurcation are traced, px. */
const FORK_TRACE = 16;
/** A bifurcation whose branches vote for a side by less than this (net votes) is dropped as unreliable. */
const FORK_SIDE_MIN = 0.5;
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
  length: number,
): [number, number] {
  let cur = start;
  for (let step = 0; step < length; step++) {
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
 * One branch's vote for the side of the axis it lies on, from its cosine with the axis:
 * 0 for a branch nearly across the flow (|cos| < 0.3), a full vote from |cos| >= 0.7,
 * and a ramp between, so the vote never jumps when a branch wobbles by a pixel.
 */
function sideVote(c: number): number {
  return Math.sign(c) * Math.min(1, Math.max(0, (Math.abs(c) - 0.3) / 0.4));
}

/** Skeleton pixels within this radius of a fork vote on the local ridge axis, px. */
const FLOW_RADIUS = 12;
/** Each voter's own tangent is the principal axis of the skeleton in this radius, px. */
const TANGENT_RADIUS = 3;

/**
 * The local ridge axis around (x, y), in [0, pi): the ridge pixels within FLOW_RADIUS each vote
 * with their own tangent (principal axis of the skeleton in a small window, weighted by how
 * line-like it is) as a doubled-angle vector, so the neighbouring ridges, which run along the
 * flow, outvote the fork's own diverging branches. Unlike picking among the branches, this
 * does not flip when the three branches are nearly evenly spaced.
 */
function flowAxis(skel: Uint8Array, w: number, h: number, x: number, y: number): number {
  let vx = 0;
  let vy = 0;
  for (let py = Math.max(0, y - FLOW_RADIUS); py <= Math.min(h - 1, y + FLOW_RADIUS); py++) {
    for (let px = Math.max(0, x - FLOW_RADIUS); px <= Math.min(w - 1, x + FLOW_RADIUS); px++) {
      if (!skel[py * w + px] || Math.hypot(px - x, py - y) > FLOW_RADIUS) continue;
      // Second moments of the skeleton about this pixel.
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      for (let qy = Math.max(0, py - TANGENT_RADIUS); qy <= Math.min(h - 1, py + TANGENT_RADIUS); qy++) {
        for (let qx = Math.max(0, px - TANGENT_RADIUS); qx <= Math.min(w - 1, px + TANGENT_RADIUS); qx++) {
          if (!skel[qy * w + qx]) continue;
          sxx += (qx - px) * (qx - px);
          syy += (qy - py) * (qy - py);
          sxy += (qx - px) * (qy - py);
        }
      }
      // (sxx - syy, 2 sxy) has length lambda1 - lambda2 and angle twice the principal axis.
      vx += sxx - syy;
      vy += 2 * sxy;
    }
  }
  const t = 0.5 * Math.atan2(vy, vx);
  return t;
}

/**
 * Crossing-number minutiae of a one-pixel skeleton (1 = ridge): CN = 1/2 sum of
 * |P(i) - P(i+1)| over the 8 neighbours, 1 an ending, 3 a bifurcation.
 *
 * Angles are in radians in (-pi, pi] with screen y pointing down. An ending's
 * angle is the direction its ridge is traced (8 px) turned half a circle, so it
 * points out of the ridge, away from it. A bifurcation's angle lies along the local
 * ridge flow (see flowAxis), turned to the side where the fork opens: the sign
 * is the one that most of the three branches (traced 16 px, see sideVote) lie on, so it
 * points down the fork, away from the stem. A fork whose branches do not settle on a
 * side (net vote under 0.5) is a bridge or spur with no direction worth keeping, and is
 * dropped: any sign for it would flip with the pixel grid.
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
      // Near a fork the branches are still splayed after 8 px; 16 px lets them settle onto the flow.
      const length = cn === 1 ? TRACE : FORK_TRACE;
      const dirs = starts.map((k) => {
        const seen = new Set<number>([i, ...ringPixels]);
        const [vx, vy] = trace(skel, w, h, x, y, (y + DY[k]) * w + x + DX[k], seen, length);
        return Math.atan2(vy, vx);
      });

      if (cn === 1) {
        found.push({ x, y, angle: wrap(dirs[0] + Math.PI), kind: "ending" });
      } else if (dirs.length === 3) {
        // The ridge flow around the fork gives the axis; the branches say which way along it is the fork.
        const axis = flowAxis(skel, w, h, x, y);
        let along = 0;
        for (const d of dirs) along += sideVote(Math.cos(d - axis));
        // Branches that do not agree on a side (a bridge between ridges, a spur) have no fork direction to give.
        if (Math.abs(along) < FORK_SIDE_MIN) continue;
        const angle = wrap(along >= 0 ? axis : axis + Math.PI);
        found.push({ x, y, angle, kind: "bifurcation" });
      }
    }
  }
  return found.filter((m, i) => found.every((o, j) => i === j || Math.hypot(o.x - m.x, o.y - m.y) >= PAIR_GAP));
}
