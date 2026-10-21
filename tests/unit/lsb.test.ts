import { describe, expect, it } from "vitest";
import {
  CapacityError,
  DEMO_MESSAGE,
  MAGIC,
  capacityBytes,
  embed,
  extract,
  randomEmbed,
  syntheticCover,
  verifyEmbedded,
} from "../../src/tools/stego/lsb";
import { makePixels, type Pixels } from "../../src/tools/imagekit/pixels";
import { mulberry32 } from "../../src/tools/imagekit/rng";

/** An opaque w x h image of seeded uniform noise: not a stego image. */
function noiseImage(w: number, h: number, seed: number): Pixels {
  const p = makePixels(w, h, [0, 0, 0, 255]);
  const rnd = mulberry32(seed);
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) p.data[i * 4 + c] = Math.floor(rnd() * 256);
  return p;
}

/** Writes `bytes` into the LSBs of the first channels of an opaque `p`, MSB-first. */
function writeLsbs(p: Pixels, bytes: number[]) {
  let bit = 0;
  for (const b of bytes) {
    for (let k = 7; k >= 0; k--, bit++) {
      const idx = Math.floor(bit / 3) * 4 + (bit % 3);
      p.data[idx] = (p.data[idx] & 0xfe) | ((b >> k) & 1);
    }
  }
}

describe("lsb format", () => {
  it("spells BLFY", () => {
    expect(new TextDecoder().decode(MAGIC)).toBe("BLFY");
  });

  it("round-trips the demo message", () => {
    expect(extract(embed(syntheticCover(1), DEMO_MESSAGE))).toBe(DEMO_MESSAGE);
  });

  it("round-trips accents, em dashes and emoji byte-exact", () => {
    for (const msg of ["Glocke — 04:10 ✓", "café crème", "bell 🔔 stopped", ""]) {
      expect(extract(embed(syntheticCover(2), msg))).toBe(msg);
    }
  });

  it("returns a new image and leaves the cover untouched", () => {
    const cover = syntheticCover(3);
    const before = cover.data.slice();
    const out = embed(cover, DEMO_MESSAGE);
    expect(out).not.toBe(cover);
    expect(out.data).not.toBe(cover.data);
    expect(cover.data).toEqual(before);
  });

  it("changes only the least significant bit of opaque RGB, never alpha", () => {
    const cover = syntheticCover(4);
    const out = embed(cover, DEMO_MESSAGE);
    for (let i = 0; i < cover.data.length; i++) {
      if (i % 4 === 3) expect(out.data[i]).toBe(cover.data[i]);
      else expect(Math.abs(out.data[i] - cover.data[i])).toBeLessThanOrEqual(1);
    }
    expect(out.data.some((v, i) => v !== cover.data[i])).toBe(true);
  });

  it("skips transparent pixels and survives a canvas round trip (transparent left half)", () => {
    const cover = syntheticCover(6, 64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) cover.data[(y * 64 + x) * 4 + 3] = 0;
    const out = embed(cover, DEMO_MESSAGE);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 32; x++) {
        const i = (y * 64 + x) * 4;
        expect([...out.data.slice(i, i + 4)]).toEqual([...cover.data.slice(i, i + 4)]);
      }
    }
    // A canvas clears the colour of fully transparent pixels; the message must not depend on it.
    const cleared = { ...out, data: out.data.slice() };
    for (let i = 0; i < cleared.data.length; i += 4) {
      if (cleared.data[i + 3] === 0) cleared.data.fill(0, i, i + 3);
    }
    expect(extract(cleared)).toBe(DEMO_MESSAGE);
  });

  it("skips partly transparent pixels too (alpha < 255)", () => {
    const cover = syntheticCover(7, 32, 32);
    for (let i = 0; i < 32 * 32; i += 2) cover.data[i * 4 + 3] = 200;
    const out = embed(cover, "half translucent");
    for (let i = 0; i < 32 * 32; i += 2) {
      expect([...out.data.slice(i * 4, i * 4 + 4)]).toEqual([...cover.data.slice(i * 4, i * 4 + 4)]);
    }
    expect(extract(out)).toBe("half translucent");
  });
});

describe("capacity", () => {
  it("counts opaque pixels x 3 / 8 minus the 8-byte header", () => {
    expect(capacityBytes(makePixels(16, 16, [9, 9, 9, 255]))).toBe(88);
    expect(capacityBytes(makePixels(16, 16, [9, 9, 9, 0]))).toBe(0);
    expect(capacityBytes(makePixels(1, 1, [9, 9, 9, 255]))).toBe(0);
    const half = makePixels(16, 16, [9, 9, 9, 255]);
    for (let i = 0; i < 128; i++) half.data[i * 4 + 3] = 0;
    expect(capacityBytes(half)).toBe(Math.floor((128 * 3) / 8) - 8);
  });

  it("holds a message that exactly fills the capacity", () => {
    const img = makePixels(16, 16, [120, 130, 140, 255]);
    const msg = "x".repeat(88);
    expect(extract(embed(img, msg))).toBe(msg);
  });

  it("throws the exact capacity error one byte over", () => {
    const img = makePixels(16, 16, [120, 130, 140, 255]);
    let err: unknown;
    try {
      embed(img, "x".repeat(89));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CapacityError);
    expect((err as CapacityError).message).toBe("That message needs 97 bytes; this image holds 96.");
    expect((err as CapacityError).needed).toBe(97);
    expect((err as CapacityError).capacity).toBe(96);
  });

  it("counts UTF-8 bytes, not characters", () => {
    const img = makePixels(16, 16, [120, 130, 140, 255]);
    expect(extract(embed(img, "é".repeat(44)))).toBe("é".repeat(44)); // 88 bytes
    expect(() => embed(img, "é".repeat(45))).toThrow("That message needs 98 bytes; this image holds 96.");
    expect(() => embed(img, "🔔".repeat(23))).toThrow("That message needs 100 bytes; this image holds 96.");
  });

  it("refuses an image too small for the header", () => {
    expect(() => embed(makePixels(2, 2, [1, 2, 3, 255]), "")).toThrow(CapacityError);
    // 12 channels hold 1 byte, and the header alone needs 8: both counted with the header (Ruling P3-R5)
    expect(() => embed(makePixels(2, 2, [1, 2, 3, 255]), "")).toThrow("That message needs 8 bytes; this image holds 1.");
  });
});

describe("extract", () => {
  it("returns null for a clean synthetic cover", () => {
    expect(extract(syntheticCover(5))).toBeNull();
  });

  it("returns null for random noise and for blank and tiny images", () => {
    for (let seed = 1; seed <= 20; seed++) expect(extract(noiseImage(64, 64, seed))).toBeNull();
    expect(extract(makePixels(64, 64, [0, 0, 0, 255]))).toBeNull();
    expect(extract(makePixels(64, 64, [255, 255, 255, 255]))).toBeNull();
    expect(extract(makePixels(1, 1, [1, 1, 1, 255]))).toBeNull();
    expect(extract(makePixels(64, 64, [1, 1, 1, 0]))).toBeNull();
  });

  it("returns null when the magic is right but the length exceeds the capacity", () => {
    const img = noiseImage(16, 16, 9);
    writeLsbs(img, [0x42, 0x4c, 0x46, 0x59, 0x00, 0x00, 0x10, 0x00]); // length 4096 > 88
    expect(extract(img)).toBeNull();
    const huge = noiseImage(16, 16, 10);
    writeLsbs(huge, [0x42, 0x4c, 0x46, 0x59, 0xff, 0xff, 0xff, 0xff]);
    expect(extract(huge)).toBeNull();
  });

  it("returns null when the payload is not valid UTF-8", () => {
    const img = noiseImage(16, 16, 11);
    writeLsbs(img, [0x42, 0x4c, 0x46, 0x59, 0, 0, 0, 2, 0xff, 0xfe]);
    expect(extract(img)).toBeNull();
  });

  it("reads a hand-built header and payload", () => {
    const img = noiseImage(16, 16, 12);
    writeLsbs(img, [0x42, 0x4c, 0x46, 0x59, 0, 0, 0, 2, 0x68, 0x69]);
    expect(extract(img)).toBe("hi");
  });
});

/** The first `n` bytes of an all-opaque image's LSB stream, MSB-first. */
function lsbBytes(p: Pixels, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let bit = 0; bit < n * 8; bit++) out[bit >> 3] |= (p.data[Math.floor(bit / 3) * 4 + (bit % 3)] & 1) << (7 - (bit & 7));
  return out;
}

describe("large payloads (Ruling P3-R9)", () => {
  it("extract streams the bits: a 2000 x 2000 image with a 1 MB payload allocates no index array", () => {
    const img = makePixels(2000, 2000, [120, 130, 140, 255]);
    const msg = "The bell was stopped at 04:10. ".repeat(33_000); // 1 023 000 bytes
    const stego = embed(img, msg);

    const Real = Int32Array;
    let largest = 0;
    globalThis.Int32Array = new Proxy(Real, {
      construct(target, args) {
        const a = Reflect.construct(target, args) as Int32Array;
        largest = Math.max(largest, a.length);
        return a;
      },
    });
    let out: string | null;
    try {
      out = extract(stego);
    } finally {
      globalThis.Int32Array = Real;
    }
    expect(largest).toBe(0);
    expect(out).toBe(msg);
  });
});

describe("re-embedding (Ruling P3-R12)", () => {
  it("wipes the old message first, so its tail can't be read past the new one's end", () => {
    const cover = syntheticCover(8, 128, 128);
    const old = "The east bracket holds the ledger; the courier left at 04:10. ".repeat(20);
    const first = embed(cover, old);
    const second = embed(first, "short");
    expect(extract(second)).toBe("short");

    const oldBytes = lsbBytes(first, 8 + old.length);
    const after = lsbBytes(second, 8 + old.length);
    let same = 0;
    for (let i = 8 + 5; i < oldBytes.length; i++) if (after[i] === oldBytes[i]) same++;
    // random bits match a given byte about 1 time in 256
    expect(same / (oldBytes.length - 13)).toBeLessThan(0.05);
    expect(new TextDecoder().decode(after.subarray(13))).not.toContain("east bracket");
  });

  it("leaves a clean cover's low bits past the message untouched, so embedding it stays deterministic", () => {
    const cover = syntheticCover(9, 64, 64);
    expect(embed(cover, DEMO_MESSAGE).data).toEqual(embed(cover, DEMO_MESSAGE).data);
  });
});

describe("verifyEmbedded (Ruling P3-R8)", () => {
  const stego = embed(syntheticCover(10, 64, 64), DEMO_MESSAGE);
  const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47);

  it("is ok when the saved PNG decodes to the same message", async () => {
    await expect(verifyEmbedded(png, DEMO_MESSAGE, async () => stego)).resolves.toEqual({ ok: true });
  });

  it("names the problem when the browser changed the pixels while saving", async () => {
    // canvas-noise defences nudge low bits: flip a few early ones and the header no longer reads
    const noisy = { ...stego, data: stego.data.slice() };
    for (let i = 0; i < 40; i += 4) noisy.data[i] ^= 1;
    await expect(verifyEmbedded(png, DEMO_MESSAGE, async () => noisy)).resolves.toEqual({
      ok: false,
      problem:
        "This browser changed the picture while saving it, so the message did not survive. Try another browser, or turn off fingerprinting protection for this page.",
    });
  });

  it("names the problem when a different message reads back", async () => {
    const other = embed(syntheticCover(10, 64, 64), "another");
    await expect(verifyEmbedded(png, DEMO_MESSAGE, async () => other)).resolves.toMatchObject({ ok: false });
  });

  it("hands the decoder the exact PNG bytes", async () => {
    let seen: Uint8Array | null = null;
    await verifyEmbedded(png, DEMO_MESSAGE, async (b) => {
      seen = b;
      return stego;
    });
    expect(seen).toBe(png);
  });
});

describe("syntheticCover", () => {
  it("is 256 x 256 opaque by default and deterministic per seed", () => {
    const a = syntheticCover(1);
    expect([a.width, a.height]).toEqual([256, 256]);
    for (let i = 3; i < a.data.length; i += 4) expect(a.data[i]).toBe(255);
    expect(syntheticCover(1).data).toEqual(a.data);
    expect(syntheticCover(2).data).not.toEqual(a.data);
    const b = syntheticCover(1, 40, 24);
    expect([b.width, b.height, b.data.length]).toEqual([40, 24, 40 * 24 * 4]);
  });

  it("has the comb-like histogram of a contrast-stretched image", () => {
    const p = syntheticCover(1);
    const hist = new Array<number>(256).fill(0);
    for (let i = 0; i < p.width * p.height; i++) hist[p.data[i * 4]]++;
    const used = hist.map((n, v) => (n > 0 ? v : -1)).filter((v) => v >= 0);
    const lo = used[0];
    const hi = used[used.length - 1];
    expect(hi - lo).toBeGreaterThan(80); // a wide tonal range
    // the x1.3 stretch skips roughly one value in four inside the range
    let empty = 0;
    for (let v = lo + 10; v <= hi - 10; v++) if (hist[v] === 0) empty++;
    expect(empty).toBeGreaterThan(8);
  });
});

describe("randomEmbed", () => {
  const lsbs = (p: Pixels) => {
    const out: number[] = [];
    for (let i = 0; i < p.data.length; i++) if (i % 4 !== 3) out.push(p.data[i] & 1);
    return out;
  };

  it("is deterministic, leaves alpha and the upper bits alone, and returns a copy", () => {
    const cover = syntheticCover(1, 64, 64);
    const before = cover.data.slice();
    const a = randomEmbed(cover, 1, 42);
    expect(cover.data).toEqual(before);
    expect(randomEmbed(cover, 1, 42).data).toEqual(a.data);
    expect(randomEmbed(cover, 1, 43).data).not.toEqual(a.data);
    for (let i = 0; i < cover.data.length; i++) expect(a.data[i] >> 1).toBe(cover.data[i] >> 1);
  });

  it("randomises only the first share of the channel stream", () => {
    const cover = makePixels(64, 64, [100, 100, 100, 255]); // all LSBs 0
    const out = lsbs(randomEmbed(cover, 0.5, 7));
    const half = out.length / 2;
    const first = out.slice(0, half).reduce((s, v) => s + v, 0);
    expect(first / half).toBeGreaterThan(0.45);
    expect(first / half).toBeLessThan(0.55);
    expect(out.slice(half).every((v) => v === 0)).toBe(true);
    expect(lsbs(randomEmbed(cover, 0, 7)).every((v) => v === 0)).toBe(true);
  });

  it("skips non-opaque pixels", () => {
    const cover = makePixels(32, 32, [100, 100, 100, 255]);
    for (let i = 0; i < 32 * 32; i += 2) cover.data[i * 4 + 3] = 0;
    const out = randomEmbed(cover, 1, 5);
    for (let i = 0; i < 32 * 32; i += 2) {
      expect([...out.data.slice(i * 4, i * 4 + 4)]).toEqual([...cover.data.slice(i * 4, i * 4 + 4)]);
    }
  });
});
