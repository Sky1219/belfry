import { describe, expect, test } from "vitest";
import { CELL_H, CELL_W, nextPosition, placeNear } from "../../src/board/placement";

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
