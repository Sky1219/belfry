import { describe, expect, test } from "vitest";
import { Transition } from "../../src/tools/detective/features/transition";

describe("Transition", () => {
  test("progress goes 0 → 1 over the duration", () => {
    const tr = new Transition(900);
    expect(tr.progress(0)).toBe(1); // nothing running yet
    tr.start(1000);
    expect(tr.progress(1000)).toBe(0);
    expect(tr.progress(1450)).toBeCloseTo(0.5, 9);
    expect(tr.progress(5000)).toBe(1);
    expect(tr.running(1450)).toBe(true);
    expect(tr.running(1950)).toBe(false);
  });

  test("reports the end exactly once, so the previous mode's models can be switched off", () => {
    const tr = new Transition(900);
    tr.start(0);
    expect(tr.consumeEnd(500)).toBe(false);
    expect(tr.consumeEnd(950)).toBe(true);
    expect(tr.consumeEnd(1000)).toBe(false);
    tr.start(2000);
    expect(tr.consumeEnd(3000)).toBe(true);
  });
});
