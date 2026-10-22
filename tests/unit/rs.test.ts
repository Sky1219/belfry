import { beforeAll, describe, expect, it } from "vitest";
import { forensicsDemoPixels } from "../../src/tools/photo/demo";
import { downscale, makePixels, type Pixels } from "../../src/tools/imagekit/pixels";
import { mulberry32 } from "../../src/tools/imagekit/rng";
import { DEMO_MESSAGE, embed, extract, randomEmbed, syntheticCover } from "../../src/tools/stego/lsb";
import { rsAnalysis } from "../../src/tools/stego/rs";
import { stegoFinding } from "../../src/tools/stego/finding";
import { chiSquareAttack } from "../../src/tools/stego/stats";

const LIMIT = "Only detects sequential LSB embedding. Absence of a signal isn't proof of a clean image.";
const FLAT = "Text, screenshots, flat graphics and small images can read this high with no hidden message.";
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

  it("skips groups touching 0, 1, 254 or 255: a saturated image gives no estimate (Ruling P3-R6)", () => {
    const sat = makePixels(64, 64);
    const rnd = mulberry32(3);
    for (let i = 0; i < sat.data.length; i += 4) {
      for (let c = 0; c < 3; c++) sat.data[i + c] = [0, 1, 254, 255][Math.floor(rnd() * 4)];
      sat.data[i + 3] = 255;
    }
    expect(rsAnalysis(sat).rate).toBeNull();
  });

  it("averages the channels that have enough unsaturated groups", () => {
    // red and green are pinned at 255, blue carries the fully embedded cover: only blue may speak
    const full = randomEmbed(cover, 1, 9);
    const one: Pixels = { width: full.width, height: full.height, data: full.data.slice() };
    for (let i = 0; i < one.data.length; i += 4) one.data[i] = one.data[i + 1] = 255;
    const { rate } = rsAnalysis(one);
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThanOrEqual(0.8);
  });

  it("is null when every channel's equation fails, and the chi-square p still decides (Ruling P3-R4)", () => {
    const full = randomEmbed(syntheticCover(1), 1, 9);
    const rs = rsAnalysis(full);
    expect(rs.rate).toBeNull();
    const f = stegoFinding({ payload: null, chi: chiSquareAttack(full), rs });
    expect(f.verdict).toBe("consistent");
    expect(f.detail).toMatchObject({ kind: "measurement", value: null });
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

  it("a payload over 4 KB shows its first 4096 bytes, says so, and keeps its full size (Ruling P3-R9)", () => {
    const long = "é".repeat(3000) + "tail"; // 6004 bytes; byte 4096 falls inside no character (2-byte é)
    const f = stegoFinding({ payload: long, chi: CLEAN_CHI, rs: { rate: 0 } });
    expect(f.verdict).toBe("payload");
    expect(f.bytes).toBe(6004);
    expect(f.detail).toEqual({ kind: "decode", scheme: "LSB", text: "é".repeat(2048) });
    expect(f.body).toContain("A Belfry LSB message of 6004 bytes was read from the image. 6004 bytes; showing the first 4 KB.");
    expect(f.body.endsWith(LIMIT)).toBe(true);
    // a character split at the cut is left out whole, never shown as U+FFFD
    const odd = stegoFinding({ payload: "a" + "é".repeat(3000), chi: CLEAN_CHI, rs: { rate: 0 } });
    expect(odd.detail).toEqual({ kind: "decode", scheme: "LSB", text: "a" + "é".repeat(2047) });
    // at exactly 4096 bytes nothing is cut and there is no note
    const exact = stegoFinding({ payload: "x".repeat(4096), chi: CLEAN_CHI, rs: { rate: 0 } });
    expect(exact.detail).toMatchObject({ text: "x".repeat(4096) });
    expect(exact.body).not.toContain("showing the first");
  });

  it("chi-square p 0.99 at 100% reads consistent, with the rate as an estimate and no uncertainty (Ruling P3-R10)", () => {
    const f = stegoFinding({ payload: null, chi: [{ fraction: 1, p: 0.99 }], rs: { rate: 0.4 } });
    expect(f.title).toBe("Hidden data: consistent with sequential LSB embedding");
    expect(f.verdict).toBe("consistent");
    expect(f.detail).toEqual({ kind: "measurement", value: 0.4, unit: "of capacity (estimate)", decimals: 2 });
    expect(f.body).toContain("Chi-square p at 100% of the image's low bits: 0.99.");
    expect(f.body).toContain("0.40");
    expect(f.body).toContain("The RS estimate reads low for sequential embedding.");
    expect(f.body).not.toContain(FLAT);
    expect(f.body.endsWith(LIMIT)).toBe(true);
  });

  it("RS alone reaches at most inconclusive, and says flat graphics read high (Ruling P3-R6)", () => {
    const f = stegoFinding({ payload: null, chi: CLEAN_CHI, rs: { rate: 0.3 } });
    expect(f.verdict).toBe("inconclusive");
    expect(f.title).toBe("Hidden data: inconclusive");
    expect(f.body.endsWith(`${FLAT} ${LIMIT}`)).toBe(true);
    expect(stegoFinding({ payload: null, chi: CLEAN_CHI, rs: { rate: 1 } }).verdict).toBe("inconclusive");
  });

  it("the chi-square p at the first 10% alone doesn't read consistent (k = 10% not adopted)", () => {
    const chi = [
      { fraction: 0.1, p: 1 },
      { fraction: 1, p: 0 },
    ];
    expect(stegoFinding({ payload: null, chi, rs: { rate: 0.01 } }).verdict).toBe("no-sign");
  });

  it("a middle-band chi-square p with a high RS reads inconclusive without the flat-graphics line", () => {
    const f = stegoFinding({ payload: null, chi: [{ fraction: 1, p: 0.6 }], rs: { rate: 0.2 } });
    expect(f.verdict).toBe("inconclusive");
    expect(f.body).not.toContain(FLAT);
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

  it("bands on the displayed numbers: p-hat 0.046 shows 0.05 and is inconclusive", () => {
    const f = stegoFinding({ payload: null, chi: CLEAN_CHI, rs: { rate: 0.046 } });
    expect(f.verdict).toBe("inconclusive");
    expect(f.body).toContain("0.05");
    expect(f.detail).toMatchObject({ value: 0.05 });
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
    expect(clean.detail).toEqual({ kind: "measurement", value: null, unit: "of capacity (estimate)" });
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

/** Black glyph bars on white: lines of text-like strokes in two levels only, like a crisp text render. */
function textLike(w: number, h: number, seed: number): Pixels {
  const p = makePixels(w, h, [255, 255, 255, 255]);
  const rnd = mulberry32(seed);
  for (let base = 46; base < h - 20; base += 26) {
    for (let x = 40; x < w - 40; ) {
      const gw = 1 + Math.floor(rnd() * 3);
      const gh = 6 + Math.floor(rnd() * 10);
      for (let y = base - gh; y < base; y++) {
        for (let xx = x; xx < x + gw; xx++) p.data.fill(0, (y * w + xx) * 4, (y * w + xx) * 4 + 3);
      }
      x += gw + 1 + Math.floor(rnd() * 3) + (rnd() < 0.15 ? 5 : 0);
    }
  }
  return p;
}

describe("embedded covers still read through the chi-square p (Ruling P3-R6)", () => {
  const read = (p: Pixels) => stegoFinding({ payload: extract(p), chi: chiSquareAttack(p), rs: rsAnalysis(p) });

  it("random embedding at 100% reads consistent", () => {
    expect(read(randomEmbed(syntheticCover(5), 1, 9)).verdict).toBe("consistent");
  });

  it("random embedding at 50% reads inconclusive: chi at 100% is low, and RS alone can't reach consistent", () => {
    // k = 10% would make this consistent, but it read two clean inputs as embedded (see the final-fix report)
    const f = read(randomEmbed(syntheticCover(5), 0.5, 9));
    expect(f.verdict).toBe("inconclusive");
    expect(f.body).toContain(FLAT);
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

  it("a 320 px box-downscale of the plan 1 demo photo", () => {
    const r = analyse(downscale(forensicsDemoPixels().pixels, 320));
    expect(r, JSON.stringify(r)).toMatchObject({ title: NO_SIGN });
  });

  it("a two-level text-like graphic (black glyph bars on white, 800 x 600) doesn't read consistent", () => {
    const r = analyse(textLike(800, 600, 1));
    expect(r.title, JSON.stringify(r)).not.toBe("Hidden data: consistent with sequential LSB embedding");
  });

  it("an image holding the demo message reads as a payload", () => {
    expect(analyse(embed(syntheticCover(5), DEMO_MESSAGE)).title).toBe("Hidden data: LSB payload found");
  });
});
