export const CELL_W = 260;
export const CELL_H = 200;

/** Size of a card on the wall (React Flow positions are its top-left corner). */
export const CARD_W = 220;
export const CARD_H = 180;

export interface Pt {
  x: number;
  y: number;
}

/** A link drawn on the wall, from one card's right stud to another's left stud. */
export interface Segment {
  a: Pt;
  b: Pt;
}

/** Link lines between cards, approximated from card positions (studs sit mid-height on each side). */
export function linkSegments(positions: Map<string, Pt>, links: Array<{ fromId: string; toId: string }>): Segment[] {
  const out: Segment[] = [];
  for (const l of links) {
    const f = positions.get(l.fromId);
    const t = positions.get(l.toId);
    if (f && t) out.push({ a: { x: f.x + CARD_W, y: f.y + CARD_H / 2 }, b: { x: t.x, y: t.y + CARD_H / 2 } });
  }
  return out;
}

/** Does segment ab cross the rectangle [x0,x1]×[y0,y1]? (Liang–Barsky clipping.) */
function segmentHitsRect(s: Segment, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const edges: Array<[number, number]> = [
    [-dx, s.a.x - x0],
    [dx, x1 - s.a.x],
    [-dy, s.a.y - y0],
    [dy, y1 - s.a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * A slot is taken if a card placed there would overlap any existing card's
 * cell-sized footprint, or sit on a link line (and the label at its middle).
 */
const occupied = (existing: Pt[], p: Pt, segments: Segment[] = []) =>
  existing.some((e) => Math.abs(e.x - p.x) < CELL_W && Math.abs(e.y - p.y) < CELL_H) ||
  segments.some((s) => segmentHitsRect(s, p.x - 16, p.y - 16, p.x + CARD_W + 16, p.y + CARD_H + 16));

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

/** First free grid slot, spiralling out from `near` (default: origin), clear of cards and link lines. */
export function nextPosition(existing: Pt[], near: Pt = { x: 0, y: 0 }, segments: Segment[] = []): Pt {
  for (const [i, j] of spiral()) {
    const p = { x: near.x + i * CELL_W, y: near.y + j * CELL_H };
    if (!occupied(existing, p, segments)) return p;
  }
  return { x: near.x, y: near.y };
}

/** `count` free slots to the right of `anchor`, row by row (same row first, then below, then above). */
export function placeNear(existing: Pt[], anchor: Pt, count: number, segments: Segment[] = []): Pt[] {
  const taken = [...existing];
  const out: Pt[] = [];
  const rows = [0, 1, -1, 2, -2, 3, -3];
  for (const row of rows) {
    for (let k = 1; k <= 6 && out.length < count; k++) {
      const p = { x: anchor.x + k * CELL_W, y: anchor.y + row * CELL_H };
      if (occupied(taken, p, segments)) continue;
      out.push(p);
      taken.push(p);
    }
    if (out.length === count) return out;
  }
  while (out.length < count) {
    const p = nextPosition(taken, anchor, segments);
    out.push(p);
    taken.push(p);
  }
  return out;
}

/** Everything on a case's wall that a new card must not cover: cards and the links between them. */
export async function wallGeometry(store: {
  listEvidence(caseId: string): Promise<Array<{ id: string; position: Pt }>>;
  listLinks(caseId: string): Promise<Array<{ fromId: string; toId: string }>>;
}, caseId: string): Promise<{ taken: Pt[]; segments: Segment[] }> {
  const [evidence, links] = await Promise.all([store.listEvidence(caseId), store.listLinks(caseId)]);
  const positions = new Map(evidence.map((e) => [e.id, e.position]));
  return { taken: evidence.map((e) => e.position), segments: linkSegments(positions, links) };
}