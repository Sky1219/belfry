import { beforeAll, describe, expect, it } from "vitest";
import { forensicsDemoPixels } from "../../src/tools/photo/demo";
import { makePixels, type Pixels } from "../../src/tools/imagekit/pixels";
import { mulberry32 } from "../../src/tools/imagekit/rng";
import { DEMO_MESSAGE, embed, extract, randomEmbed, syntheticCover } from "../../src/tools/stego/lsb";
import { rsAnalysis } from "../../src/tools/stego/rs";
import { stegoFinding } from "../../src/tools/stego/finding";
import { chiSquareAttack } from "../../src/tools/stego/stats";

const LIMIT = "Only detects sequential LSB embedding. Absence of a signal isn't proof of a clean image.";
const CLEAN_CHI = [{ fraction: 1, p: 0.01 }];

describe("rsAnalysis", () => {
  let cover: Pixels;
  beforeAll(() => {
    cover = syntheticCover(5);
  });

  it("reads a clean cover as nearly empty: rate < 0.05", () => {
    const { rate } = rsAnalysis(cover);
    expect(rate).not.toBeNull();
    expect(rate!).toBeLessThan(0.05);
  });

  it("estimates a half-embedded cover at 0.5 +- 0.1", () => {
    const { rate } = rsAnalysis(randomEmbed(cover, 0.5, 9));
    expect(rate).not.toBeNull();
    expect(Math.abs(rate! - 0.5)).toBeLessThanOrEqual(0.1);
  });

  it("estimates a fully embedded cover at >= 0.85", () => {
    const { rate } = rsAnalysis(randomEmbed(cover, 1, 9));
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThanOrEqual(0.85);
  });

  it("is null, never NaN, for an image too small to form 64 groups", () => {
    expect(rsAnalysis(syntheticCover(3, 1, 4)).rate).toBeNull();
    expect(rsAnalysis(makePixels(0, 0)).rate).toBeNull();
  });

  it("is null or finite, never NaN, for a flat image", () => {
    const { rate } = rsAnalysis(makePixels(64, 64, [90, 90, 90, 255]));
    expect(rate === null || Number.isFinite(rate)).toBe(true);
  });

  it("ignores transparent pixels, as the embedder does", () => {
    const full = randomEmbed(cover, 1, 9);
    const mixed: Pixels = { width: full.width, height: full.height, data: full.data.slice() };
    // every other pixel becomes transparent noise: only the fully embedded opaque pixels may count
    const rnd = mulberry32(4);
    for (let i = 0; i < mixed.data.length; i += 8) {
      for (let c = 0; c < 3; c++) mixed.data[i + 4 + c] = Math.floor(rnd() * 256);
      mixed.data[i + 7] = 0;
    }
    const { rate } = rsAnalysis(mixed);
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThanOrEqual(0.8);
  });
});

describe("stegoFinding", () => {
  it("a payload gives the decode finding", () => {
    const f = stegoFinding({ payload: DEMO_MESSAGE, chi: CLEAN_CHI, rs: { rate: 0 } });
    expect(f.title).toBe("Hidden data: LSB payload found");
    expect(f.verdict).toBe("payload");
    expect(f.detail).toEqual({ kind: "decode", scheme: "LSB", text: DEMO_MESSAGE });
    expect(f.body.endsWith(LIMIT)).toBe(true);
  });

  it("chi-square p 0.99 at 100% reads consistent, with the rate as a measurement", () => {
    const f = stegoFinding({ payload: null, chi: [{ fraction: 1, p: 0.99 }], rs: { rate: 0.4 } });
    expect(f.title).toBe("Hidden data: consistent with sequential LSB embedding");
    expect(f.verdict).toBe("consistent");
    expect(f.detail).toEqual({ kind: "measurement", value: 0.4, unit: "of capacity", uncertainty: 0.05, decimals: 2 });
    expect(f.body).toContain("0.99");
    expect(f.body).toContain("0.40");
    expect(f.body.endsWith(LIMIT)).toBe(true);
  });

  it("an RS estimate of 0.10 or more reads consistent on its own", () => {
    const f = stegoFinding({ payload: null, chi: CLEAN_CHI, rs: { rate: 0.3 } });
    expect(f.verdict).toBe("consistent");
  });

  it("the middle bands read inconclusive", () => {
    expect(stegoFinding({ payload: null, chi: [{ fraction: 1, p: 0.6 }], rs: { rate: 0 } })).toMatchObject({
      title: "Hidden data: inconclusive",
      verdict: "inconclusive",
    });
    expect(stegoFinding({ payload: null, chi: CLEAN_CHI, rs: { rate: 0.07 } }).verdict).toBe("inconclusive");
  });

  it("a clean result reads no sign, and still ends with the limit", () => {
    const f = stegoFinding({ payload: null, chi: CLEAN_CHI, rs: { rate: 0.01 } });
    expect(f.title).toBe("Hidden data: no sign of sequential LSB embedding");
    expect(f.verdict).toBe("no-sign");
    expect(f.body.endsWith(LIMIT)).toBe(true);
  });

  it("bands on the displayed numbers: p-hat 0.096 shows 0.10 and is consistent", () => {
    const f = stegoFinding({ payload: null, chi: CLEAN_CHI, rs: { rate: 0.096 } });
    expect(f.verdict).toBe("consistent");
    expect(f.body).toContain("0.10");
    expect(f.detail).toMatchObject({ value: 0.1 });
  });

  it("bands on the displayed numbers: p-hat 0.044 shows 0.04 and is no sign", () => {
    const f = stegoFinding({ payload: null, chi: CLEAN_CHI, rs: { rate: 0.044 } });
    expect(f.verdict).toBe("no-sign");
    expect(f.body).toContain("0.04");
    expect(f.detail).toMatchObject({ value: 0.04 });
  });

  it("bands the chi-square p on its displayed value: 0.946 shows 0.95 and is consistent", () => {
    const f = stegoFinding({ payload: null, chi: [{ fraction: 1, p: 0.946 }], rs: { rate: 0 } });
    expect(f.verdict).toBe("consistent");
    expect(f.body).toContain("0.95");
  });

  it("a null rate shows -- and lets the chi-square p decide", () => {
    const clean = stegoFinding({ payload: null, chi: CLEAN_CHI, rs: { rate: null } });
    expect(clean.verdict).toBe("no-sign");
    expect(clean.detail).toEqual({ kind: "measurement", value: null, unit: "of capacity" });
    expect(clean.body).toContain("--");
    const hit = stegoFinding({ payload: null, chi: [{ fraction: 1, p: 0.99 }], rs: { rate: null } });
    expect(hit.verdict).toBe("consistent");
    expect(hit.detail).toMatchObject({ value: null });
  });

  it("uses the 100% entry of the chi-square list, wherever it sits", () => {
    const f = stegoFinding({
      payload: null,
      chi: [
        { fraction: 1, p: 0.01 },
        { fraction: 0.5, p: 0.99 },
      ],
      rs: { rate: 0 },
    });
    expect(f.verdict).toBe("no-sign");
  });
});

describe("clean inputs read no sign (end to end)", () => {
  const analyse = (p: Pixels) => {
    const chi = chiSquareAttack(p);
    const rs = rsAnalysis(p);
    const f = stegoFinding({ payload: extract(p), chi, rs });
    return { title: f.title, rate: rs.rate, chi1: chi[chi.length - 1].p };
  };
  const NO_SIGN = "Hidden data: no sign of sequential LSB embedding";

  it("the synthetic cover", () => {
    expect(analyse(syntheticCover(5)).title).toBe(NO_SIGN);
  });

  it("the plan 1 demo photo", () => {
    const r = analyse(forensicsDemoPixels().pixels);
    expect(r, JSON.stringify(r)).toMatchObject({ title: NO_SIGN });
  });

  it("a smooth gradient with sigma 2 noise", () => {
    const w = 256;
    const h = 256;
    const rnd = mulberry32(21);
    const g = (): number => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    const p = makePixels(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        p.data[i] = 40 + (x * 170) / w + 2 * g();
        p.data[i + 1] = 60 + (y * 140) / h + 2 * g();
        p.data[i + 2] = 200 - ((x + y) * 120) / (w + h) + 2 * g();
        p.data[i + 3] = 255;
      }
    }
    const r = analyse(p);
    expect(r, JSON.stringify(r)).toMatchObject({ title: NO_SIGN });
  });

  it("an image holding the demo message reads as a payload", () => {
    expect(analyse(embed(syntheticCover(5), DEMO_MESSAGE)).title).toBe("Hidden data: LSB payload found");
  });
});
