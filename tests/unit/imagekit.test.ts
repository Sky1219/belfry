import { describe, expect, test } from "vitest";
import { heatmapPixels } from "../../src/tools/imagekit/heatmap";
import { downscale, fitWithin, makePixels, toGray } from "../../src/tools/imagekit/pixels";
import { mulberry32, percentile } from "../../src/tools/imagekit/rng";
import { verdictFor, verdictTitle } from "../../src/tools/imagekit/verdict";

const px = (p: { data: Uint8ClampedArray }, i: number) => Array.from(p.data.slice(i * 4, i * 4 + 4));

describe("pixels", () => {
  test("makePixels fills with the given colour, transparent black by default", () => {
    const p = makePixels(2, 1, [1, 2, 3, 4]);
    expect(Array.from(p.data)).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
    expect(Array.from(makePixels(1, 1).data)).toEqual([0, 0, 0, 0]);
  });

  test("toGray weights channels by BT.601", () => {
    expect(Array.from(toGray(makePixels(1, 1, [255, 0, 0, 255])))[0]).toBeCloseTo(76.245, 3);
    expect(Array.from(toGray(makePixels(1, 1, [255, 255, 255, 255])))[0]).toBeCloseTo(255, 3);
  });

  test("downscale box-filters to the max side and keeps aspect", () => {
    const p = makePixels(4, 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 2; x < 4; x++) p.data.set([200, 200, 200, 255], (y * 4 + x) * 4);
    }
    const d = downscale(p, 2);
    expect([d.width, d.height]).toEqual([2, 2]);
    expect(Array.from({ length: 4 }, (_, i) => d.data[i * 4])).toEqual([0, 200, 0, 200]);
    const wide = downscale(makePixels(8, 4, [10, 10, 10, 255]), 4);
    expect([wide.width, wide.height]).toEqual([4, 2]);
    expect(px(wide, 0)).toEqual([10, 10, 10, 255]);
  });

  test("downscale returns the same object when already within", () => {
    const p = makePixels(3, 2);
    expect(downscale(p, 8)).toBe(p);
  });

  test("fitWithin allows up to 40 megapixels", () => {
    expect(fitWithin(8000, 5000)).toBe(true);
    expect(fitWithin(8000, 5001)).toBe(false);
  });
});

describe("rng", () => {
  test("mulberry32 is deterministic per seed and stays in [0, 1)", () => {
    const draw = (seed: number) => {
      const r = mulberry32(seed);
      return Array.from({ length: 5 }, () => r());
    };
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)[0]).not.toBe(draw(43)[0]);
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("percentile ignores non-finite values and is NaN only when empty", () => {
    expect(percentile([1, 2, 3, 4, 5, NaN], 0.5)).toBe(3);
    expect(percentile([1, Infinity, 2], 1)).toBe(2);
    expect(percentile([1, 2], 0.5)).toBeCloseTo(1.5, 6);
    expect(percentile([], 0.5)).toBeNaN();
    expect(percentile([NaN], 0.5)).toBeNaN();
  });
});

describe("heatmapPixels", () => {
  test("ramps black to amber to white", () => {
    const h = heatmapPixels(Float32Array.of(0, 5, 10), 3, 1, { lo: 0, hi: 10 });
    expect([h.width, h.height]).toEqual([3, 1]);
    expect(px(h, 0)).toEqual([0, 0, 0, 255]);
    expect(px(h, 1)).toEqual([255, 167, 51, 255]);
    expect(px(h, 2)).toEqual([255, 255, 255, 255]);
  });

  test("clips outside the range", () => {
    const h = heatmapPixels(Float32Array.of(-5, 15), 2, 1, { lo: 0, hi: 10 });
    expect(px(h, 0)).toEqual([0, 0, 0, 255]);
    expect(px(h, 1)).toEqual([255, 255, 255, 255]);
  });

  test("a flat range or non-finite value is black", () => {
    const flat = heatmapPixels(Float32Array.of(3, 3), 2, 1, { lo: 3, hi: 3 });
    expect(px(flat, 0)).toEqual([0, 0, 0, 255]);
    const odd = heatmapPixels(Float32Array.of(NaN, 10), 2, 1, { lo: 0, hi: 10 });
    expect(px(odd, 0)).toEqual([0, 0, 0, 255]);
    const none = heatmapPixels(Float32Array.of(NaN), 1, 1);
    expect(px(none, 0)).toEqual([0, 0, 0, 255]);
  });

  test("without a range, lo and hi are the 1st and 99th percentiles", () => {
    const v = Float32Array.from({ length: 101 }, (_, i) => i);
    const h = heatmapPixels(v, 101, 1);
    expect(px(h, 0)).toEqual([0, 0, 0, 255]);
    expect(px(h, 50)).toEqual([255, 167, 51, 255]);
    expect(px(h, 100)).toEqual([255, 255, 255, 255]);
    expect(px(h, 1)).toEqual([0, 0, 0, 255]);
    expect(px(h, 99)).toEqual([255, 255, 255, 255]);
  });
});

describe("verdicts", () => {
  const t = { inconclusiveAt: 0.3, consistentAt: 0.5 };

  test("verdictFor bands a score", () => {
    expect(verdictFor(0.6, t)).toBe("consistent");
    expect(verdictFor(0.5, t)).toBe("consistent");
    expect(verdictFor(0.4, t)).toBe("inconclusive");
    expect(verdictFor(0.3, t)).toBe("inconclusive");
    expect(verdictFor(0.1, t)).toBe("no-sign");
    expect(verdictFor(null, t)).toBe("inconclusive");
    expect(verdictFor(NaN, t)).toBe("inconclusive");
  });

  test("verdictTitle uses the fixed wording", () => {
    expect(verdictTitle("Copy-move", "consistent", "cloned regions")).toBe(
      "Copy-move: consistent with cloned regions",
    );
    expect(verdictTitle("Copy-move", "no-sign", "cloned regions")).toBe("Copy-move: no sign of cloned regions");
    expect(verdictTitle("Copy-move", "inconclusive", "cloned regions")).toBe("Copy-move: inconclusive");
  });
});
