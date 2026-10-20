import { describe, expect, test } from "vitest";
import { BlinkCounter, eyeAspectRatio, gazeDirection, GazeTracker } from "../../src/tools/detective/features/vitals";
import type { FaceResult, Landmark } from "../../src/tools/detective/models/types";

/** Minimal face: eye outlines (EAR indices), eye corners and iris centers. */
function face(opts: { open?: number; irisDx?: number; irisDy?: number } = {}): NonNullable<FaceResult> {
  const open = opts.open ?? 0.012; // half lid gap
  const lm: Landmark[] = new Array(478).fill(null).map(() => ({ x: 0.5, y: 0.3, z: 0 }));
  const set = (i: number, x: number, y: number) => (lm[i] = { x, y, z: 0 });
  const eye = ([c1, u1, u2, c2, l2, l1]: number[], cx: number, iris: number) => {
    set(c1, cx - 0.02, 0.3);
    set(u1, cx - 0.007, 0.3 - open);
    set(u2, cx + 0.007, 0.3 - open);
    set(c2, cx + 0.02, 0.3);
    set(l2, cx + 0.007, 0.3 + open);
    set(l1, cx - 0.007, 0.3 + open);
    set(iris, cx + (opts.irisDx ?? 0), 0.3 + (opts.irisDy ?? 0));
  };
  eye([33, 160, 158, 133, 153, 144], 0.46, 468);
  eye([362, 385, 387, 263, 373, 380], 0.54, 473);
  return { landmarks: lm, box: [0.4, 0.2, 0.6, 0.45] };
}

const ear = (open: number) => eyeAspectRatio(face({ open }), "left");

/** Feed a 30 fps EAR stream where `closedAt(t)` says whether the eye is shut. */
function run(counter: BlinkCounter, seconds: number, closedAt: (tMs: number) => boolean) {
  const openEar = ear(0.012);
  const closedEar = ear(0.001);
  for (let t = 0; t <= seconds * 1000; t += 1000 / 30) counter.push(t, closedAt(t) ? closedEar : openEar);
}

describe("vitals", () => {
  test("EAR drops when the eye closes", () => {
    expect(ear(0.012)).toBeGreaterThan(0.24);
    expect(ear(0.001)).toBeLessThan(0.19);
    expect(eyeAspectRatio(face({ open: 0.012 }), "right")).toBeCloseTo(ear(0.012), 9);
  });

  test("counts 10 blinks in 60 s", () => {
    const c = new BlinkCounter();
    run(c, 60, (t) => t % 6000 >= 3000 && t % 6000 < 3150);
    expect(c.blinksPerMinute(60_000)).toBe(10);
  });

  test("hysteresis ignores flicker around one threshold", () => {
    const c = new BlinkCounter({ closeBelow: 0.19, openAbove: 0.24 });
    let t = 0;
    for (let i = 0; i < 600; i++, t += 33) c.push(t, i % 2 ? 0.2 : 0.23); // jitters between the thresholds
    expect(c.blinksPerMinute(t)).toBe(0);
  });

  test("a 2 s closure is not a blink", () => {
    const c = new BlinkCounter();
    run(c, 20, (t) => t >= 5000 && t < 7000);
    expect(c.blinksPerMinute(20_000)).toBe(0);
  });

  test("null before 10 s", () => {
    const c = new BlinkCounter();
    run(c, 9, () => false);
    expect(c.blinksPerMinute(9000)).toBeNull();
  });

  test("gaze left/center/right/down from iris position", () => {
    expect(gazeDirection(face())).toBe("center");
    expect(gazeDirection(face({ irisDx: -0.012 }))).toBe("left");
    expect(gazeDirection(face({ irisDx: 0.012 }))).toBe("right");
    expect(gazeDirection(face({ irisDy: 0.008, open: 0.012 }))).toBe("down");
  });

  test("awayPercent is 25 when looking away a quarter of the time", () => {
    const g = new GazeTracker();
    // 32 s window = 8 whole cycles of (1 s away, 3 s center)
    for (let t = 100; t <= 32_000; t += 100) g.push(t, (t - 100) % 4000 < 1000 ? "left" : "center");
    expect(g.awayPercent(32_000, 32)).toBeCloseTo(25, 0);
  });
});
