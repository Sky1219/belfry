import { describe, expect, it } from "vitest";
import { ops } from "../../src/platform/workers/ops";
import { comparePrints, fingerprintFinding } from "../../src/tools/fingerprint/match";
import { analysePrint, type PrintAnalysis } from "../../src/tools/fingerprint/pipeline";
import { synthPrint } from "../../src/tools/fingerprint/synth";
import { mulberry32 } from "../../src/tools/imagekit/rng";

const W = 320;
const H = 400;

/** One standard-normal draw (Box-Muller). */
function gaussian(rand: () => number): number {
  const u = 1 - rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** A photo with no print in it: `base(x, y)` plus sensor noise of `sigma` grey levels. */
function blank(seed: number, sigma: number, base: (x: number, y: number) => number): Float32Array {
  const rand = mulberry32(seed);
  const gray = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) gray[y * W + x] = base(x, y) + sigma * gaussian(rand);
  }
  return gray;
}

/** Bilinear resample of a grayscale image by `s`, as the same finger photographed nearer or further. */
function resample(gray: Float32Array, w: number, h: number, s: number): { gray: Float32Array; w: number; h: number } {
  const ow = Math.round(w * s);
  const oh = Math.round(h * s);
  const out = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const sx = Math.min(w - 1.001, x / s);
      const sy = Math.min(h - 1.001, y / s);
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      out[y * ow + x] =
        gray[y0 * w + x0] * (1 - fx) * (1 - fy) +
        gray[y0 * w + x0 + 1] * fx * (1 - fy) +
        gray[(y0 + 1) * w + x0] * (1 - fx) * fy +
        gray[(y0 + 1) * w + x0 + 1] * fx * fy;
    }
  }
  return { gray: out, w: ow, h: oh };
}

const analyse = (o: Parameters<typeof synthPrint>[0]): PrintAnalysis => {
  const p = synthPrint(o);
  return analysePrint(p.gray, p.width, p.height);
};
const finding = (a: PrintAnalysis, b: PrintAnalysis) => fingerprintFinding(a.minutiae, b.minutiae, comparePrints(a, b));

const printA = analyse({ seed: 3 });
const demoB = synthPrint({ seed: 3, rotateDeg: 15, dx: 30, dy: -20 });

describe("a photo with no print in it (Review Focus 1, Ruling P2-R9)", () => {
  // per 8 x 8 block, a constant offset of -2 to +2 grey levels, as a JPEG of a blank wall leaves
  const blockRand = mulberry32(17);
  const offsets = Array.from({ length: (W / 8) * (H / 8) }, () => Math.round(blockRand() * 4 - 2));
  const cases: Array<[string, Float32Array]> = [
    ["flat, noise sigma 2", blank(1, 2, () => 128)],
    ["flat, noise sigma 4", blank(2, 4, () => 128)],
    ["a smooth lighting gradient, noise sigma 3", blank(3, 3, (x, y) => 90 + (80 * x) / W + (30 * y) / H)],
    ["8 x 8 block artefacts, noise sigma 2", blank(4, 2, (x, y) => 128 + offsets[Math.floor(y / 8) * (W / 8) + Math.floor(x / 8)])],
  ];

  for (const [name, gray] of cases) {
    it(`reads ${name} as inconclusive with no score, against a print and against itself`, () => {
      const empty = analysePrint(gray, W, H);
      for (const f of [finding(printA, empty), finding(empty, printA), finding(empty, empty)]) {
        expect(f.title).toBe("Fingerprint match: inconclusive");
        expect(f.verdict).toBe("inconclusive");
        expect(f.score).toBeNull();
        expect(f.detail).toBeUndefined();
        expect(f.body).toMatch(/not enough ridge detail|too noisy to read reliably/);
      }
    });
  }

  it("matches a noisy pair quickly in the worker op", () => {
    const empty = analysePrint(cases[1][1], W, H);
    const t = performance.now();
    ops.fingerprintMatch({ a: empty, b: empty });
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("the same finger at a different distance (Ruling P2-R11)", () => {
  for (const s of [0.9, 1.1]) {
    it(`does not read demo print B scaled x${s} as no sign`, () => {
      const r = resample(demoB.gray, demoB.width, demoB.height, s);
      const f = finding(printA, analysePrint(r.gray, r.w, r.h));
      expect(f.verdict).not.toBe("no-sign");
      expect(f.score).not.toBeNull();
    });
  }

  it("reports the median ridge frequency over the known blocks", () => {
    const p = synthPrint({ seed: 3 });
    const f = analysePrint(p.gray, p.width, p.height).medianFrequency;
    // the synth's true spacing runs 5.6-9 px (Ruling P2-R3)
    expect(f).toBeGreaterThan(1 / 10);
    expect(f).toBeLessThan(1 / 5);
    const r = resample(p.gray, p.width, p.height, 1.2);
    expect(analysePrint(r.gray, r.w, r.h).medianFrequency).toBeLessThan(f);
  });

  it("still matches the demo pair and still tells a different finger apart", () => {
    const demo = finding(printA, analysePrint(demoB.gray, demoB.width, demoB.height));
    expect(demo.verdict).toBe("consistent");
    expect(finding(printA, analyse({ seed: 11 })).verdict).toBe("no-sign");
  });
});

describe("print B upside down (Review Focus 3)", () => {
  it("reads seed 3 against its exact 180 degree pixel rotation as consistent", () => {
    const p = synthPrint({ seed: 3 });
    const turned = Float32Array.from(p.gray).reverse();
    const f = finding(printA, analysePrint(turned, p.width, p.height));
    expect(f.title).toBe("Fingerprint match: consistent with the same finger");
    expect(f.score).toBeGreaterThanOrEqual(0.4);
  });
});
