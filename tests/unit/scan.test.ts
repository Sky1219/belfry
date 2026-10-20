import { describe, expect, test } from "vitest";
import { cropRect, ScanController } from "../../src/tools/detective/features/scan";
import type { Track } from "../../src/tools/detective/features/tracker";

const C = { nx: 0.5, ny: 0.5 };
const tr = (id: number, box: [number, number, number, number]): Track => ({
  id,
  tag: `EV-0${id}`,
  label: "cup",
  score: 0.9,
  box,
  firstSeenMs: 0,
  lastSeenMs: 0,
});
const atCenter = tr(1, [0.4, 0.4, 0.6, 0.6]);
const other = tr(2, [0.45, 0.45, 0.55, 0.55]);

/** Steps the controller every 33 ms from t0 to t1; returns the first fired track and the time it fired. */
function step(s: ScanController, t0: number, t1: number, tracks: Track[]) {
  for (let t = t0; t <= t1; t += 33) {
    const r = s.update(t, tracks, C);
    if (r.fire) return { fired: r.fire, at: t };
  }
  return null;
}

describe("ScanController", () => {
  test("fires after 2 s of continuous targeting", () => {
    const s = new ScanController();
    const r = step(s, 0, 3000, [atCenter]);
    expect(r?.fired.id).toBe(1);
    expect(r!.at).toBeGreaterThanOrEqual(2000);
    expect(r!.at).toBeLessThan(2100);
  });

  test("resets when the target changes", () => {
    const s = new ScanController();
    expect(step(s, 0, 1500, [atCenter])).toBeNull();
    // a smaller box now covers the center → new target, progress restarts
    expect(s.update(1533, [atCenter, other], C).progress01).toBeLessThan(0.05);
    expect(step(s, 1566, 3300, [atCenter, other])).toBeNull();
    expect(step(s, 3333, 4000, [atCenter, other])?.fired.id).toBe(2);
  });

  test("does not refire on the same track within 10 s", () => {
    const s = new ScanController();
    const first = step(s, 0, 3000, [atCenter])!;
    expect(step(s, first.at + 33, first.at + 9900, [atCenter])).toBeNull();
    expect(step(s, first.at + 9933, first.at + 13000, [atCenter])?.fired.id).toBe(1);
  });

  test("click scans immediately even during cooldown", () => {
    const s = new ScanController();
    const first = step(s, 0, 3000, [atCenter])!;
    expect(s.clickScan(atCenter, first.at + 100)?.id).toBe(1);
  });

  test("cropRect pads 15%, clamps to the frame, and caps the long side at 512", () => {
    const r = cropRect([0.4, 0.4, 0.6, 0.5], 1280, 720);
    // box is 256×72 px; padding 15% of each side
    expect(r.sx).toBeCloseTo(512 - 0.15 * 256, 6);
    expect(r.sw).toBeCloseTo(256 * 1.3, 6);
    expect(r.sh).toBeCloseTo(72 * 1.3, 6);
    expect(Math.max(r.outW, r.outH)).toBeLessThanOrEqual(512);

    const edge = cropRect([0, 0, 0.1, 0.1], 1280, 720);
    expect(edge.sx).toBe(0);
    expect(edge.sy).toBe(0);

    const big = cropRect([0, 0, 1, 1], 1920, 1080);
    expect(big.sw).toBe(1920);
    expect(big.outW).toBe(512);
    expect(big.outH).toBe(288);
  });
});
