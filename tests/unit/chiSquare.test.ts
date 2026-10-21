import { beforeAll, describe, expect, it } from "vitest";
import { forensicsDemoPixels } from "../../src/tools/photo/demo";
import { randomEmbed, syntheticCover } from "../../src/tools/stego/lsb";
import { chi2cdf, chiSquareAttack, gammaP } from "../../src/tools/stego/stats";
import type { Pixels } from "../../src/tools/imagekit/pixels";

describe("chi2cdf", () => {
  it("matches the 95th-percentile critical values", () => {
    expect(chi2cdf(3.841459, 1)).toBeCloseTo(0.95, 4);
    expect(chi2cdf(18.307, 10)).toBeCloseTo(0.95, 4);
  });
  it("is 0 at 0 and 1 far out", () => {
    expect(chi2cdf(0, 5)).toBe(0);
    expect(chi2cdf(1e6, 5)).toBeCloseTo(1, 10);
  });
  it("gammaP covers both the series and the continued-fraction branch", () => {
    expect(gammaP(1, 1)).toBeCloseTo(1 - Math.exp(-1), 10); // x < a + 1
    expect(gammaP(1, 5)).toBeCloseTo(1 - Math.exp(-5), 10); // x >= a + 1
  });
});

describe("chiSquareAttack", () => {
  let cover: Pixels;
  beforeAll(() => {
    cover = syntheticCover(5);
  });

  const at = (r: Array<{ fraction: number; p: number }>, f: number) => r.find((e) => Math.abs(e.fraction - f) < 1e-9)!.p;

  it("returns one entry per step, fractions 0.1 .. 1.0", () => {
    const r = chiSquareAttack(cover);
    expect(r).toHaveLength(10);
    expect(r[0].fraction).toBeCloseTo(0.1, 12);
    expect(r[9].fraction).toBe(1);
    expect(chiSquareAttack(cover, 4).map((e) => e.fraction)).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it("a clean cover is flagged: p < 0.05 at 100%", () => {
    expect(at(chiSquareAttack(cover), 1)).toBeLessThan(0.05);
  });

  it("a fully randomised cover reads p > 0.95 at every fraction", () => {
    const r = chiSquareAttack(randomEmbed(cover, 1, 9));
    for (const e of r) expect(e.p).toBeGreaterThan(0.95);
  });

  it("a half-embedded cover is flat early and drops once past the payload", () => {
    const r = chiSquareAttack(randomEmbed(cover, 0.5, 9));
    for (const e of r.filter((x) => x.fraction <= 0.4)) expect(e.p).toBeGreaterThan(0.95);
    expect(at(r, 1)).toBeLessThan(0.5);
  });

  it("a prefix with fewer than 2 usable pairs reads p 0, not NaN", () => {
    const tiny = syntheticCover(3, 2, 2);
    for (const e of chiSquareAttack(tiny)) expect(e.p).toBe(0);
  });

  it("walks only opaque channels, as the embedder does", () => {
    const full = randomEmbed(cover, 1, 9);
    const mixed: Pixels = { width: full.width, height: full.height, data: full.data.slice() };
    // make every other pixel transparent and put its clean cover bytes back: counted by mistake,
    // they would drag p down, so only the opaque, fully randomised pixels may be read
    for (let i = 3; i < mixed.data.length; i += 8) {
      mixed.data.set(cover.data.subarray(i - 3, i), i - 3);
      mixed.data[i] = 0;
    }
    for (const e of chiSquareAttack(mixed)) expect(e.p).toBeGreaterThan(0.95);
  });
});

describe("chiSquareAttack on a realistic photo", () => {
  it("measures the demo scene at 100%", () => {
    const r = chiSquareAttack(forensicsDemoPixels().pixels);
    const p = r[r.length - 1].p;
    console.info(`forensicsDemoPixels chi-square p at 1.0 = ${p}`);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});
