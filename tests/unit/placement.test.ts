import { describe, expect, test } from "vitest";
import { CARD_H, CARD_W, CELL_H, CELL_W, linkSegments, nextPosition, placeNear } from "../../src/board/placement";

describe("placement", () => {
  test("first slot is the origin", () => {
    expect(nextPosition([])).toEqual({ x: 0, y: 0 });
  });

  test("skips occupied slots", () => {
    const p = nextPosition([{ x: 0, y: 0 }]);
    expect(p).not.toEqual({ x: 0, y: 0 });
    expect(Math.abs(p.x) <= CELL_W && Math.abs(p.y) <= CELL_H).toBe(true);
    // a card slightly off-grid still blocks its slot
    expect(nextPosition([{ x: 30, y: -20 }])).not.toEqual({ x: 0, y: 0 });
  });

  test("never returns a slot whose card would overlap an existing card", () => {
    const existing = [{ x: 160, y: -20 }];
    const p = nextPosition(existing);
    const overlaps = existing.some((e) => Math.abs(e.x - p.x) < CELL_W && Math.abs(e.y - p.y) < CELL_H);
    expect(overlaps).toBe(false);
  });

  test("prefers right, then below, before going left or up", () => {
    expect(nextPosition([{ x: 0, y: 0 }])).toEqual({ x: CELL_W, y: 0 });
    expect(nextPosition([{ x: 0, y: 0 }, { x: CELL_W, y: 0 }])).toEqual({ x: 0, y: CELL_H });
  });

  test("spirals around a near point", () => {
    const near = { x: 1000, y: 500 };
    const taken = [near];
    const seen: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 8; i++) {
      const p = nextPosition([...taken, ...seen], near);
      seen.push(p);
    }
    // the eight neighbors of the near cell, each exactly one cell away
    for (const p of seen) {
      expect(Math.max(Math.abs(p.x - near.x) / CELL_W, Math.abs(p.y - near.y) / CELL_H)).toBe(1);
    }
    expect(new Set(seen.map((p) => `${p.x},${p.y}`)).size).toBe(8);
  });

  test("never places a card on a link line or its label", () => {
    // two cards three cells apart, linked: the line runs through the cells between them
    const a = { x: 0, y: 0 };
    const b = { x: 3 * CELL_W, y: 0 };
    const segments = linkSegments(
      new Map([
        ["a", a],
        ["b", b],
      ]),
      [{ fromId: "a", toId: "b" }],
    );
    const p = nextPosition([a, b], { x: CELL_W, y: 0 }, segments);
    const hit = segments.some((s) => {
      const y = s.a.y; // horizontal line
      return y >= p.y - 16 && y <= p.y + CARD_H + 16 && Math.max(s.a.x, s.b.x) >= p.x - 16 && Math.min(s.a.x, s.b.x) <= p.x + CARD_W + 16;
    });
    expect(hit).toBe(false);
    // without the link, the same request takes the slot on the line
    expect(nextPosition([a, b], { x: CELL_W, y: 0 })).toEqual({ x: CELL_W, y: 0 });
  });

  test("placeNear returns count distinct free slots right of the anchor", () => {
    const anchor = { x: 0, y: 0 };
    const blocked = { x: CELL_W, y: 0 };
    const slots = placeNear([anchor, blocked], anchor, 2);
    expect(slots).toHaveLength(2);
    expect(new Set(slots.map((p) => `${p.x},${p.y}`)).size).toBe(2);
    for (const p of slots) {
      expect(p.x).toBeGreaterThan(anchor.x);
      expect(`${p.x},${p.y}`).not.toBe(`${blocked.x},${blocked.y}`);
    }
  });
});
