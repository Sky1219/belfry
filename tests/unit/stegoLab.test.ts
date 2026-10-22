import { describe, expect, it } from "vitest";
import { ops } from "../../src/platform/workers/ops";
import { makePixels } from "../../src/tools/imagekit/pixels";
import { forensicsDemoPixels } from "../../src/tools/photo/demo";
import { stegoDemoPixels } from "../../src/tools/stego/demo";
import { embeddedShare, stegoFinding } from "../../src/tools/stego/finding";
import { DEMO_MESSAGE, embed, syntheticCover } from "../../src/tools/stego/lsb";
import { stegoManifest } from "../../src/tools/stego/manifest";

describe("stego lab", () => {
  it("registers under the plan's id, name, blurb, demo label and icon", () => {
    expect(stegoManifest).toMatchObject({
      id: "stego-lab",
      name: "Steganography lab",
      blurb: "Hide a message in a photo, or test one for hidden data",
      accepts: ["image"],
      demo: { label: "Run the demo image" },
      icon: "stego",
    });
  });

  it("the demo's clean cover (seed 21, 512 × 384) reads no sign", () => {
    const r = ops.stegoAnalyse(syntheticCover(21, 512, 384));
    expect(r.payload).toBeNull();
    expect(stegoFinding(r).verdict).toBe("no-sign");
  });

  it("the demo image carries the demo message, read back in one op with both detectors", () => {
    const px = stegoDemoPixels();
    expect([px.width, px.height]).toEqual([512, 384]);
    const r = ops.stegoAnalyse(px);
    expect(r.payload).toBe(DEMO_MESSAGE);
    expect(r.chi.map((e) => e.fraction)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    expect(r.rs.rate === null || Number.isFinite(r.rs.rate)).toBe(true);
    const f = stegoFinding(r);
    expect(f.verdict).toBe("payload");
    expect(f.detail).toEqual({ kind: "decode", scheme: "LSB", text: DEMO_MESSAGE });
  });

  it("the demo shows both detectors working: the first 60% reads embedded, then the cliff, and RS sees it (Ruling P3-R11)", () => {
    const r = ops.stegoAnalyse(stegoDemoPixels());
    for (const e of r.chi) {
      if (e.fraction <= 0.6 + 1e-9) expect(e.p, `k ${e.fraction}`).toBeGreaterThanOrEqual(0.95);
      else expect(e.p, `k ${e.fraction}`).toBeLessThan(0.5);
    }
    expect(embeddedShare(r.chi)).toBeCloseTo(0.6, 9);
    expect(r.rs.rate).not.toBeNull();
    expect(r.rs.rate!).toBeGreaterThanOrEqual(0.3);
  });

  it("embeddedShare is the leading run of bars that read embedded (rounded p 0.95 or more)", () => {
    const bars = (ps: number[]) => ps.map((p, i) => ({ fraction: (i + 1) / ps.length, p }));
    expect(embeddedShare(bars([0.01, 0.99, 1, 1]))).toBe(0);
    expect(embeddedShare(bars([0.946, 0.99, 0.2, 1]))).toBe(0.5);
    expect(embeddedShare(bars([1, 1, 1, 1]))).toBe(1);
    expect(embeddedShare([])).toBe(0);
  });

  it("reads a message hidden in a photographic scene, accents and all", () => {
    const message = "Meet at the belfry — café, 23:00 ✓";
    const r = ops.stegoAnalyse(embed(forensicsDemoPixels().pixels, message));
    expect(r.payload).toBe(message);
  });

  it("gives ten finite readings and no payload for a one-pixel image", () => {
    const one = makePixels(1, 1);
    one.data.set([10, 20, 30, 255]);
    const r = ops.stegoAnalyse(one);
    expect(r.payload).toBeNull();
    expect(r.chi).toHaveLength(10);
    for (const e of r.chi) expect(Number.isFinite(e.p)).toBe(true);
    expect(r.rs.rate).toBeNull();
    expect(stegoFinding(r).verdict).toBe("no-sign");
  });
});
