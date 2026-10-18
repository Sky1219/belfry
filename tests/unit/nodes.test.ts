import { describe, expect, test } from "vitest";
import { mergeNodes } from "../../src/board/nodes";
import type { Evidence } from "../../src/store/schema";

const ev = (id: string, x = 0, title = id): Evidence => ({
  id,
  caseId: "c",
  type: "note",
  title,
  tags: [],
  provenance: { createdAt: 0 },
  position: { x, y: 0 },
  meta: {},
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

describe("mergeNodes", () => {
  test("keeps React Flow's measurements and selection for existing cards", () => {
    const first = mergeNodes([], [ev("a"), ev("b")], () => []);
    const measured = first.map((n) => ({ ...n, measured: { width: 220, height: 120 }, selected: n.id === "b" }));
    const next = mergeNodes(measured, [ev("a", 50, "A renamed"), ev("b")], () => []);
    expect(next.map((n) => n.measured)).toEqual([{ width: 220, height: 120 }, { width: 220, height: 120 }]);
    expect(next.find((n) => n.id === "b")!.selected).toBe(true);
    expect(next.find((n) => n.id === "a")!.position).toEqual({ x: 50, y: 0 });
    expect(next.find((n) => n.id === "a")!.data.evidence.title).toBe("A renamed");
  });

  test("adds new cards and drops removed ones", () => {
    const prev = mergeNodes([], [ev("a"), ev("b")], () => []);
    const next = mergeNodes(prev, [ev("b"), ev("c")], () => []);
    expect(next.map((n) => n.id)).toEqual(["b", "c"]);
    expect(next.find((n) => n.id === "c")!.measured).toBeUndefined();
  });
});
