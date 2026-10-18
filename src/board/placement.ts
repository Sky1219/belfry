export const CELL_W = 260;
export const CELL_H = 200;

export interface Pt {
  x: number;
  y: number;
}

/** A slot is taken if a card placed there would overlap any existing card's cell-sized footprint. */
const occupied = (existing: Pt[], p: Pt) =>
  existing.some((e) => Math.abs(e.x - p.x) < CELL_W && Math.abs(e.y - p.y) < CELL_H);

/**
 * Grid offsets in rings of increasing distance around (0,0). Within a ring, cells
 * are ordered like reading a page: right and below first, left and above last,
 * so new cards land where the eye goes next.
 */
function* spiral(): Generator<[number, number]> {
  yield [0, 0];
  for (let r = 1; r < 200; r++) {
    const ring: Array<[number, number]> = [];
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([dx, dy]);
    }
    // penalize left/up; break ties by row, then column
    const cost = ([dx, dy]: [number, number]) => (dx < 0 ? 4 : 0) + (dy < 0 ? 2 : 0) + Math.abs(dy) * 0.5 + Math.abs(dx) * 0.25;
    ring.sort((a, b) => cost(a) - cost(b));
    yield* ring;
  }
}

/** First free grid slot, spiralling out from `near` (default: origin). */
export function nextPosition(existing: Pt[], near: Pt = { x: 0, y: 0 }): Pt {
  for (const [i, j] of spiral()) {
    const p = { x: near.x + i * CELL_W, y: near.y + j * CELL_H };
    if (!occupied(existing, p)) return p;
  }
  return { x: near.x, y: near.y };
}

/** `count` free slots to the right of `anchor`, row by row (same row first, then below, then above). */
export function placeNear(existing: Pt[], anchor: Pt, count: number): Pt[] {
  const taken = [...existing];
  const out: Pt[] = [];
  const rows = [0, 1, -1, 2, -2, 3, -3];
  for (const row of rows) {
    for (let k = 1; k <= 6 && out.length < count; k++) {
      const p = { x: anchor.x + k * CELL_W, y: anchor.y + row * CELL_H };
      if (occupied(taken, p)) continue;
      out.push(p);
      taken.push(p);
    }
    if (out.length === count) return out;
  }
  while (out.length < count) {
    const p = nextPosition(taken, anchor);
    out.push(p);
    taken.push(p);
  }
  return out;
}
