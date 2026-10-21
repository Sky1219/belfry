import { describe, expect, it } from "vitest";
import { synthPrint } from "../../src/tools/fingerprint/synth";
import { normalize, orientationField, segmentMask } from "../../src/tools/fingerprint/orientation";
import { binarize, gaborEnhance, ridgeFrequency } from "../../src/tools/fingerprint/enhance";
import { zhangSuen } from "../../src/tools/fingerprint/thin";

/** Pearson correlation of a and b over the pixels whose 16 px block is in the mask. */
function maskedPearson(a: Float32Array, b: Float32Array, w: number, mask: Uint8Array, bw: number, bh: number): number {
  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (let y = 0; y < bh * 16; y++) {
    for (let x = 0; x < bw * 16; x++) {
      if (!mask[Math.floor(y / 16) * bw + Math.floor(x / 16)]) continue;
      const va = a[y * w + x];
      const vb = b[y * w + x];
      n++;
      sa += va;
      sb += vb;
      saa += va * va;
      sbb += vb * vb;
      sab += va * vb;
    }
  }
  return (sab - (sa * sb) / n) / Math.sqrt((saa - (sa * sa) / n) * (sbb - (sb * sb) / n));
}

function prepare(opts: Parameters<typeof synthPrint>[0]) {
  const p = synthPrint(opts);
  const norm = normalize(p.gray);
  const { mask } = segmentMask(norm, p.width, p.height);
  const field = orientationField(norm, p.width, p.height);
  return { p, norm, mask, field };
}

describe("ridgeFrequency", () => {
  it("tracks the local ridge frequency of a synthetic print", () => {
    const { p, norm, mask, field } = prepare({ seed: 3, period: 9, noise: 0.15 });
    const freq = ridgeFrequency(norm, p.width, p.height, field, mask);
    expect(freq.length).toBe(field.bw * field.bh);
    const errs: number[] = [];
    for (let by = 0; by < field.bh; by++) {
      for (let bx = 0; bx < field.bw; bx++) {
        const est = freq[by * field.bw + bx];
        if (est <= 0) continue;
        const truth = p.frequencyAt(bx * 16 + 8, by * 16 + 8);
        errs.push(Math.abs(est - truth) / truth);
      }
    }
    expect(errs.length).toBeGreaterThan(50);
    errs.sort((a, b) => a - b);
    expect(errs[Math.floor(errs.length / 2)]).toBeLessThan(0.1);
  });

  it("keeps known values in [1/25, 1/3] and masked-out blocks at 0", () => {
    const { p, norm, mask, field } = prepare({ seed: 5, period: 7, noise: 0.15 });
    mask[0] = 0;
    const freq = ridgeFrequency(norm, p.width, p.height, field, mask);
    expect(freq[0]).toBe(0);
    for (const f of freq) {
      if (f > 0) {
        expect(f).toBeGreaterThanOrEqual(1 / 25 - 1e-6);
        expect(f).toBeLessThanOrEqual(1 / 3 + 1e-6);
      }
    }
  });
});

describe("gaborEnhance", () => {
  it("lifts a noisy print towards the noise-free one", () => {
    const noisy = prepare({ seed: 3, period: 9, noise: 0.4 });
    const clean = normalize(synthPrint({ seed: 3, period: 9, noise: 0 }).gray);
    const { p, norm, mask, field } = noisy;
    const freq = ridgeFrequency(norm, p.width, p.height, field, mask);
    const enh = gaborEnhance(norm, p.width, p.height, field, freq, mask);
    expect(enh.length).toBe(p.width * p.height);
    const before = maskedPearson(norm, clean, p.width, mask, field.bw, field.bh);
    const after = maskedPearson(enh, clean, p.width, mask, field.bw, field.bh);
    expect(after - before).toBeGreaterThanOrEqual(0.15);
  });

  it("leaves masked-out blocks at 0", () => {
    const { p, norm, mask, field } = prepare({ seed: 3, period: 9, noise: 0.15 });
    mask[0] = 0;
    const freq = ridgeFrequency(norm, p.width, p.height, field, mask);
    const enh = gaborEnhance(norm, p.width, p.height, field, freq, mask);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) expect(enh[y * p.width + x]).toBe(0);
  });
});

describe("binarize", () => {
  it("sets 1 only where the value is above 0", () => {
    expect(Array.from(binarize(Float32Array.from([-1, 0, 0.5, 2, -0.001])))).toEqual([0, 0, 1, 1, 0]);
  });
});

describe("zhangSuen", () => {
  it("thins a 5 px bar to one pixel per column, inside the original", () => {
    const w = 60;
    const h = 30;
    const bin = new Uint8Array(w * h);
    for (let y = 12; y < 17; y++) for (let x = 10; x < 50; x++) bin[y * w + x] = 1;
    const out = zhangSuen(bin, w, h);
    for (let x = 14; x <= 45; x++) {
      let count = 0;
      for (let y = 0; y < h; y++) count += out[y * w + x];
      expect(count).toBe(1);
    }
    for (let i = 0; i < out.length; i++) expect(out[i] <= bin[i]).toBe(true);
  });

  it("leaves a 1 px diagonal line unchanged", () => {
    const w = 30;
    const h = 30;
    const bin = new Uint8Array(w * h);
    for (let i = 5; i < 25; i++) bin[i * w + i] = 1;
    expect(Array.from(zhangSuen(bin, w, h))).toEqual(Array.from(bin));
  });

  it("does not modify its input", () => {
    const w = 20;
    const h = 20;
    const bin = new Uint8Array(w * h).fill(1);
    const copy = Array.from(bin);
    zhangSuen(bin, w, h);
    expect(Array.from(bin)).toEqual(copy);
  });
});
