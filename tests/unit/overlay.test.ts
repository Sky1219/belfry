import { describe, expect, test } from "vitest";
import { coverFit, toScreen } from "../../src/platform/viewport";
import type { Track } from "../../src/tools/detective/features/tracker";
import { ElevationTracker, hitTestTrack, type OverlayFrame } from "../../src/tools/detective/overlay/overlay";

const track = (id: number, box: [number, number, number, number]): Track => ({
  id,
  tag: `EV-0${id}`,
  label: "cup",
  score: 0.9,
  box,
  firstSeenMs: 0,
  lastSeenMs: 0,
});

function frame(mirror: boolean, tracks: Track[]): OverlayFrame {
  return {
    viewport: coverFit(1280, 720, 1600, 900, mirror),
    overlays: new Set(["evidence"]),
    hud: "full",
    pose: null,
    tracks,
    scan: { trackId: null, progress01: 0 },
    vitals: { bpm: null, confidence: 0, elevated: false, blinksPerMin: null, gaze: null, awayPct: null },
    faceBox: null,
    reticle: true,
  };
}

describe("overlay hit testing", () => {
  test.each([false, true])("finds the track under the pointer (mirror=%s)", (mirror) => {
    const f = frame(mirror, [track(1, [0.1, 0.1, 0.3, 0.3]), track(2, [0.6, 0.6, 0.8, 0.8])]);
    const p = toScreen(f.viewport, 0.2, 0.2);
    expect(hitTestTrack(f, p.x, p.y)).toBe(1);
    const q = toScreen(f.viewport, 0.7, 0.7);
    expect(hitTestTrack(f, q.x, q.y)).toBe(2);
  });

  test("overlapping boxes pick the smaller", () => {
    const f = frame(true, [track(1, [0.1, 0.1, 0.9, 0.9]), track(2, [0.4, 0.4, 0.5, 0.5])]);
    const p = toScreen(f.viewport, 0.45, 0.45);
    expect(hitTestTrack(f, p.x, p.y)).toBe(2);
  });

  test("outside every box → null", () => {
    const f = frame(false, [track(1, [0.1, 0.1, 0.3, 0.3])]);
    const p = toScreen(f.viewport, 0.6, 0.6);
    expect(hitTestTrack(f, p.x, p.y)).toBeNull();
  });
});

describe("ElevationTracker", () => {
  test("flags bpm above 115% of the median of the first 30 s", () => {
    const e = new ElevationTracker();
    for (let t = 0, i = 0; t <= 30_000; t += 500, i++) e.push(t, [66, 70, 74][i % 3]); // median 70 → threshold 80.5
    expect(e.elevated(80)).toBe(false);
    expect(e.elevated(81)).toBe(true);
  });

  test("never elevated before the baseline window completes", () => {
    const e = new ElevationTracker();
    for (let t = 0; t < 10_000; t += 500) e.push(t, 70);
    expect(e.elevated(140)).toBe(false);
  });
});
