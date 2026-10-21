import { describe, expect, it } from "vitest";
import { dct8x8, idct8x8, ZIGZAG } from "../../src/platform/math/dct8";
import { estimateQuality, ijgTable, IJG_LUMA, jpegFinding, readJpeg } from "../../src/tools/photo/jpeg";
import { dqScore, dqScoreFromHistograms } from "../../src/tools/photo/doubleQuant";
import { mulberry32 } from "../../src/tools/imagekit/rng";
import { jpeg, png, type Segment } from "./helpers/imageBytes";

/** A DQT segment holding one 8-bit table, written in zigzag order. */
function dqt(id: number, natural: ArrayLike<number>): Segment {
  const body = new Uint8Array(65);
  body[0] = id;
  ZIGZAG.forEach((nat, z) => (body[1 + z] = natural[nat]));
  return { marker: 0xdb, body };
}

describe("dct8", () => {
  it("puts a constant block entirely into DC", () => {
    const out = dct8x8(new Float64Array(64).fill(100));
    expect(out[0]).toBeCloseTo(800, 9);
    for (let i = 1; i < 64; i++) expect(Math.abs(out[i])).toBeLessThan(1e-9);
  });

  it("inverts on a random block", () => {
    const rnd = mulberry32(7);
    const block = Float64Array.from({ length: 64 }, () => rnd() * 255 - 128);
    const back = idct8x8(dct8x8(block));
    for (let i = 0; i < 64; i++) expect(Math.abs(back[i] - block[i])).toBeLessThan(1e-9);
  });

  it("has a zigzag that visits every natural index once", () => {
    expect([...ZIGZAG].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i));
    expect(ZIGZAG.slice(0, 6)).toEqual([0, 1, 8, 16, 9, 2]);
  });
});

describe("IJG scaling", () => {
  it("scales the Annex K table the way libjpeg does", () => {
    expect([...ijgTable(IJG_LUMA, 50)]).toEqual([...IJG_LUMA]);
    expect(ijgTable(IJG_LUMA, 90)[0]).toBe(3);
    expect(ijgTable(IJG_LUMA, 10)[0]).toBe(80);
    expect([...ijgTable(IJG_LUMA, 100)].every((v) => v === 1)).toBe(true);
  });

  it("recovers the quality from an IJG-scaled table", () => {
    for (let q = 10; q <= 95; q++) {
      const est = estimateQuality(ijgTable(IJG_LUMA, q));
      expect(Math.abs(est.quality - q)).toBeLessThanOrEqual(1);
      expect(est.ijg).toBe(true);
    }
  });

  it("flags a table that is not IJG-scaled", () => {
    expect(estimateQuality(new Uint16Array(64).fill(7)).ijg).toBe(false);
  });
});

describe("readJpeg", () => {
  it("reads the table back into natural order and the SOF kind", () => {
    const table = ijgTable(IJG_LUMA, 75);
    const info = readJpeg(jpeg(dqt(0, table)))!;
    expect([...info.tables.get(0)!]).toEqual([...table]);
    expect(info.progressive).toBe(false);
    expect(info.width).toBe(1);
    expect(info.height).toBe(1);

    const sof2: Segment = { marker: 0xc2, body: Uint8Array.of(8, 0, 20, 0, 30, 1, 1, 0x11, 0) };
    const prog = readJpeg(jpeg(dqt(0, table), sof2))!;
    expect(prog.progressive).toBe(true);
    expect(prog.height).toBe(20);
    expect(prog.width).toBe(30);
  });

  it("reads a 16-bit table", () => {
    const body = new Uint8Array(1 + 128);
    body[0] = 0x11; // 16-bit, table 1
    ZIGZAG.forEach((_, z) => {
      body[1 + z * 2] = 0x01;
      body[2 + z * 2] = z;
    });
    const info = readJpeg(jpeg({ marker: 0xdb, body }))!;
    expect(info.tables.get(1)![0]).toBe(256);
    expect(info.tables.get(1)![ZIGZAG[63]]).toBe(256 + 63);
  });

  it("returns null for a PNG", () => {
    expect(readJpeg(png([{ type: "IEND", data: new Uint8Array(0) }]))).toBeNull();
  });

  it("does not throw on a truncated file", () => {
    const whole = jpeg(dqt(0, ijgTable(IJG_LUMA, 75)));
    for (let n = 0; n < whole.length; n++) expect(() => readJpeg(whole.slice(0, n))).not.toThrow();
  });
});

/** Seeded Laplacian samples, scale b. */
function laplace(rnd: () => number, n: number, b = 12): number[] {
  return Array.from({ length: n }, () => {
    const u = rnd() - 0.5;
    return -b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  });
}

/** Histograms of |quantized value| for each of nine coefficients. */
function hists(quantize: (c: number) => number, count: number, seed = 1): number[][] {
  const rnd = mulberry32(seed);
  return Array.from({ length: 9 }, () => {
    const h: number[] = [];
    for (const c of laplace(rnd, count)) {
      const v = Math.abs(quantize(c));
      h[v] = (h[v] ?? 0) + 1;
    }
    return Array.from(h, (x) => x ?? 0);
  });
}

describe("double quantization score", () => {
  it("is low for a single quantization", () => {
    const s = dqScoreFromHistograms(hists((c) => Math.round(c / 5), 20000))!;
    expect(s).toBeLessThan(0.3);
  });

  it("is high when 7 then 5 were applied", () => {
    const s = dqScoreFromHistograms(hists((c) => Math.round((Math.round(c / 7) * 7) / 5), 20000))!;
    expect(s).toBeGreaterThan(0.5);
  });

  it("is high when 13 then 5 were applied", () => {
    const s = dqScoreFromHistograms(hists((c) => Math.round((Math.round(c / 13) * 13) / 5), 20000))!;
    expect(s).toBeGreaterThan(0.5);
  });

  it("returns null when there are too few samples", () => {
    expect(dqScoreFromHistograms(hists((c) => Math.round(c / 5), 50))).toBeNull();
    expect(dqScoreFromHistograms([])).toBeNull();
  });

  it("scores nothing without a whole 8x8 block", () => {
    expect(dqScore(new Float32Array(49), 7, 7, ijgTable(IJG_LUMA, 75))).toBeNull();
  });
});

/**
 * A size x size image whose every 8x8 block is the inverse DCT of seeded
 * Laplacian coefficients (b = 12) pushed through the given quantization steps
 * in order, plus 128. Pixels stay unrounded so only the quantization is measured.
 */
function quantizedImage(size: number, steps: Uint16Array[], seed = 5): Float32Array {
  const rnd = mulberry32(seed);
  const gray = new Float32Array(size * size);
  for (let by = 0; by < size / 8; by++) {
    for (let bx = 0; bx < size / 8; bx++) {
      const coeffs = Float64Array.from(laplace(rnd, 64));
      for (let i = 0; i < 64; i++) for (const q of steps) coeffs[i] = Math.round(coeffs[i] / q[i]) * q[i];
      const px = idct8x8(coeffs);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) gray[(by * 8 + y) * size + bx * 8 + x] = px[y * 8 + x] + 128;
    }
  }
  return gray;
}

const transposeImage = (g: Float32Array, n: number) => Float32Array.from(g, (_, i) => g[(i % n) * n + Math.floor(i / n)]);
const transposeTable = (t: Uint16Array) => Uint16Array.from(t, (_, i) => t[(i % 8) * 8 + (i >> 3)]);

describe("dqScore on pixels", () => {
  const q2 = ijgTable(IJG_LUMA, 75);
  const q1 = ijgTable(IJG_LUMA, 60);
  const N = 512; // 4096 blocks, enough counts per bin

  it("is low for one quantization and high for two", () => {
    expect(dqScore(quantizedImage(N, [q2]), N, N, q2)!).toBeLessThan(0.3);
    expect(dqScore(quantizedImage(N, [q1, q2]), N, N, q2)!).toBeGreaterThan(0.5);
  });

  it("reads the right coefficient and table entry for each block position", () => {
    // steps grow down the rows only, so a table and its transpose disagree at zigzag positions 1-9
    const rows = Uint16Array.from({ length: 64 }, (_, i) => 4 + 3 * (i >> 3));
    const single = quantizedImage(N, [rows]);
    expect(dqScore(single, N, N, rows)!).toBeLessThan(0.3);
    // a transposed image holds the transposed coefficients, so only the transposed table fits it
    const flipped = transposeImage(single, N);
    expect(dqScore(flipped, N, N, transposeTable(rows))!).toBeLessThan(0.3);
    // the unchanged table steps those coefficients with the wrong size, which leaves a comb
    expect(dqScore(flipped, N, N, rows)!).toBeGreaterThan(0.5);
  });
});

describe("jpegFinding", () => {
  const info = (table: Uint16Array) => readJpeg(jpeg(dqt(0, table)))!;

  it("names an IJG quality with ±1", () => {
    const f = jpegFinding(info(ijgTable(IJG_LUMA, 87)), null).quality;
    expect(f.title).toBe("JPEG quality: about 87");
    expect(f.body).toContain("is close to the standard IJG scaling");
    expect(f.body).not.toContain("to within 1");
    expect(f.detail).toEqual({ kind: "measurement", value: 87, unit: "quality", uncertainty: 1 });
  });

  it("says non-standard tables without a number", () => {
    const f = jpegFinding(info(new Uint16Array(64).fill(7)), null).quality;
    expect(f.title).toBe("JPEG quality: non-standard tables");
    expect(f.detail).toEqual({ kind: "measurement", value: null, unit: "quality" });
  });

  it("titles the double-quantization verdict and ends on the limit sentence", () => {
    const limit = "A photo saved twice as JPEG shows this whether or not it was edited in between.";
    const t = info(ijgTable(IJG_LUMA, 80));
    const dq = jpegFinding(t, 0.62).dq;
    expect(dq.title).toBe("Double quantization: consistent with two JPEG saves");
    expect(dq.body.endsWith(limit)).toBe(true);
    expect(dq.detail).toEqual({ kind: "measurement", value: 0.62, unit: "DQ score" });
    expect(jpegFinding(t, 0.1).dq.title).toBe("Double quantization: no sign of two JPEG saves");
    expect(jpegFinding(t, 0.4).dq.title).toBe("Double quantization: inconclusive");
  });

  it("bands the score as it is shown, rounded to 2 dp", () => {
    const t = info(ijgTable(IJG_LUMA, 80));
    const near = jpegFinding(t, 0.496).dq;
    expect(near.title).toBe("Double quantization: consistent with two JPEG saves");
    expect(near.body).toContain("Periodicity score 0.50 ");
    expect(near.detail).toEqual({ kind: "measurement", value: 0.5, unit: "DQ score" });
    const low = jpegFinding(t, 0.2996).dq;
    expect(low.title).toBe("Double quantization: inconclusive");
    expect(low.body).toContain("Periodicity score 0.30 ");
    expect(low.detail).toEqual({ kind: "measurement", value: 0.3, unit: "DQ score" });
  });

  it("says why there is no score when the file has no luminance table", () => {
    const dq = jpegFinding(readJpeg(jpeg())!, null).dq;
    expect(dq.title).toBe("Double quantization: inconclusive");
    expect(dq.body).toContain("no luminance quantization table");
    expect(dq.body).not.toContain("8×8 block");
  });

  it("reads inconclusive with no detail when there is no score", () => {
    const dq = jpegFinding(info(ijgTable(IJG_LUMA, 80)), null).dq;
    expect(dq.title).toBe("Double quantization: inconclusive");
    expect(dq.detail).toBeUndefined();
  });
});
