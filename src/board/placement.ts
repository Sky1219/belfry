export const CELL_W = 260;
export const CELL_H = 200;

export interface Pt {
  x: number;
  y: number;
}

/** A slot is taken if a card placed there would overlap any existing card's cell-sized footprint. */
const occupied = (existing: Pt[], p: Pt) =>
  existing.some((e) => Math.abs(e.x - p.x) < CELL_W && Math.abs(e.y - p.y) < CELL_H);

/** Grid offsets in rings of increasing distance around (0,0): ring 0, then the 8 cells of ring 1, etc. */
function* spiral(): Generator<[number, number]> {
  yield [0, 0];
  for (let r = 1; r < 200; r++) {
    for (let dx = -r; dx <= r; dx++) yield [dx, -r];
    for (let dy = -r + 1; dy <= r; dy++) yield [r, dy];
    for (let dx = r - 1; dx >= -r; dx--) yield [dx, r];
    for (let dy = r - 1; dy > -r; dy--) yield [-r, dy];
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
