import { describe, expect, it } from "vitest";
import { ELA_GAIN, ELA_QUALITY, elaMap } from "../../src/tools/photo/ela";
import { blockSigma, noiseInconsistency, noiseMap, noiseResidual } from "../../src/tools/photo/noise";
import { makePixels } from "../../src/tools/imagekit/pixels";
import { mulberry32 } from "../../src/tools/imagekit/rng";

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** 256x256 gray noise, sigma 4 around 128; an optional 64x64 patch at (96, 96) of sigma 12. */
function noisyImage(withPatch: boolean): Float32Array {
  const w = 256;
  const rand = mulberry32(7);
  const g = new Float32Array(w * w);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const inPatch = withPatch && x >= 96 && x < 160 && y >= 96 && y < 160;
      g[y * w + x] = 128 + gaussian(rand) * (inPatch ? 12 : 4);
    }
  }
  return g;
}

function noNaN(a: ArrayLike<number>): boolean {
  for (let i = 0; i < a.length; i++) if (Number.isNaN(a[i])) return false;
  return true;
}

describe("elaMap", () => {
  it("exposes the re-save quality and gain", () => {
    expect(ELA_QUALITY).toBe(0.9);
    expect(ELA_GAIN).toBe(20);
  });

  it("is all zeros for identical images", () => {
    const a = makePixels(4, 3, [10, 20, 30, 255]);
    const map = elaMap(a, makePixels(4, 3, [10, 20, 30, 255]));
    expect(map).toHaveLength(12);
    expect(Array.from(map).every((v) => v === 0)).toBe(true);
  });

  it("scales the largest channel difference by the gain", () => {
    const a = makePixels(3, 1, [100, 100, 100, 255]);
    const b = makePixels(3, 1, [100, 100, 100, 255]);
    b.data.set([103, 101, 100, 255], 4);
    expect(Array.from(elaMap(a, b))).toEqual([0, 60, 0]);
  });

  it("clips at 255", () => {
    const a = makePixels(1, 1, [100, 100, 100, 255]);
    const b = makePixels(1, 1, [120, 100, 100, 255]);
    expect(elaMap(a, b)[0]).toBe(255);
  });

  it("throws when the sizes differ", () => {
    expect(() => elaMap(makePixels(2, 2), makePixels(3, 2))).toThrow("elaMap: images differ in size");
  });
});

describe("noise residual and block sigma", () => {
  it("measures a noisier patch at about three times the sigma", () => {
    const g = noisyImage(true);
    const { sigma, bw, bh } = blockSigma(noiseResidual(g, 256, 256), 256, 256);
    expect(bw).toBe(16);
    expect(bh).toBe(16);
    let inside = 0;
    let outside = 0;
    let nIn = 0;
    let nOut = 0;
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const s = sigma[by * bw + bx];
        if (bx >= 6 && bx < 10 && by >= 6 && by < 10) {
          inside += s;
          nIn++;
        } else {
          outside += s;
          nOut++;
        }
      }
    }
    const ratio = inside / nIn / (outside / nOut);
    expect(ratio).toBeGreaterThan(3 * 0.75);
    expect(ratio).toBeLessThan(3 * 1.25);
  });

  it("scores a patched image as less consistent than a clean one", () => {
    const sigma = (g: Float32Array) => blockSigma(noiseResidual(g, 256, 256), 256, 256).sigma;
    const patched = noiseInconsistency(sigma(noisyImage(true)));
    const clean = noiseInconsistency(sigma(noisyImage(false)));
    expect(patched).not.toBeNull();
    expect(clean).not.toBeNull();
    expect(patched!).toBeGreaterThan(clean!);
  });

  it("gives a zero residual and no inconsistency score for a flat image", () => {
    const g = new Float32Array(64 * 64).fill(90);
    const residual = noiseResidual(g, 64, 64);
    expect(Array.from(residual).every((v) => v === 0)).toBe(true);
    const { sigma, bw, bh } = blockSigma(residual, 64, 64);
    expect(bw).toBe(4);
    expect(bh).toBe(4);
    expect(noiseInconsistency(sigma)).toBeNull();
    const map = noiseMap(g, 64, 64);
    expect(Array.from(map).every((v) => v === 0)).toBe(true);
  });

  it("has no full block in a 4x4 image", () => {
    const g = Float32Array.from({ length: 16 }, (_, i) => i * 7);
    const residual = noiseResidual(g, 4, 4);
    const { sigma, bw, bh } = blockSigma(residual, 4, 4);
    expect(bw).toBe(0);
    expect(bh).toBe(0);
    expect(sigma).toHaveLength(0);
    expect(noiseInconsistency(sigma)).toBeNull();
    const map = noiseMap(g, 4, 4);
    expect(map).toHaveLength(16);
    expect(noNaN(residual) && noNaN(map)).toBe(true);
    expect(Array.from(map).every((v) => v === 0)).toBe(true);
  });

  it("handles a 1x1 image", () => {
    const g = new Float32Array([55]);
    expect(Array.from(noiseResidual(g, 1, 1))).toEqual([0]);
    expect(Array.from(noiseMap(g, 1, 1))).toEqual([0]);
  });

  it("returns null for fewer than four finite blocks", () => {
    expect(noiseInconsistency(new Float32Array([1, 2, 3]))).toBeNull();
    expect(noiseInconsistency(new Float32Array([1, 2, 3, NaN]))).toBeNull();
  });

  it("is the coefficient of variation of the block sigmas", () => {
    // mean 5, population standard deviation 1.
    expect(noiseInconsistency(new Float32Array([4, 4, 6, 6]))).toBeCloseTo(1 / 5, 6);
  });

  it("maps each pixel to its block sigma over the median, 0 in partial edge blocks", () => {
    const map = noiseMap(noisyImage(true), 256, 256);
    expect(map).toHaveLength(256 * 256);
    expect(noNaN(map)).toBe(true);
    const inPatch = map[128 * 256 + 128];
    const outside = map[20 * 256 + 20];
    expect(inPatch).toBeGreaterThan(2);
    expect(outside).toBeGreaterThan(0.7);
    expect(outside).toBeLessThan(1.3);

    // 40x20: full blocks cover 32x16, the rest is 0.
    const rand = mulberry32(3);
    const h = Float32Array.from({ length: 40 * 20 }, () => 100 + gaussian(rand) * 5);
    const m = noiseMap(h, 40, 20);
    expect(m[5 * 40 + 5]).toBeGreaterThan(0);
    expect(m[5 * 40 + 35]).toBe(0);
    expect(m[18 * 40 + 5]).toBe(0);
  });
});
