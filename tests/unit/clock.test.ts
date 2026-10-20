import { describe, expect, test } from "vitest";
import { MonotonicClock } from "../../src/platform/media/frameSource";

describe("MonotonicClock", () => {
  test("stays strictly increasing across a backwards seek and a loop", () => {
    const c = new MonotonicClock();
    const out = [0, 33, 66, 10, 43, 0].map((t) => c.next(t));
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
    // forward spacing is preserved after the jump
    expect(out[4] - out[3]).toBe(33);
  });
});
