import { describe, expect, it } from "vitest";
import { forensicsDemoPixels } from "../../src/tools/photo/demo";
import { detectCopyMove } from "../../src/tools/photo/copyMove";
import { toGray } from "../../src/tools/imagekit/pixels";

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("forensicsDemoPixels", () => {
  it("is deterministic for a seed", () => {
    expect(forensicsDemoPixels().pixels.data).toEqual(forensicsDemoPixels().pixels.data);
  });

  it("is 512x384 and the clone destination equals its source, byte for byte", () => {
    const { pixels, cloned } = forensicsDemoPixels();
    expect([pixels.width, pixels.height]).toEqual([512, 384]);
    expect([cloned.dx, cloned.dy]).toEqual([96, 40]);
    for (let y = 0; y < cloned.h; y++) {
      const src = ((cloned.y + y) * 512 + cloned.x) * 4;
      const dst = ((cloned.y + cloned.dy + y) * 512 + cloned.x + cloned.dx) * 4;
      expect(pixels.data.subarray(dst, dst + cloned.w * 4)).toEqual(pixels.data.subarray(src, src + cloned.w * 4));
    }
  });

  it("holds a clone that copy-move finds", () => {
    const { pixels } = forensicsDemoPixels();
    const r = detectCopyMove(toGray(pixels), 512, 384);
    expect(r.shift).toEqual({ dx: 96, dy: 40 });
    expect(r.blocks).toBeGreaterThanOrEqual(40);
  });

  it("pastes a patch clear of the cloned source and destination", () => {
    const { cloned, pasted } = forensicsDemoPixels();
    const src: Rect = { x: cloned.x, y: cloned.y, w: cloned.w, h: cloned.h };
    const dst: Rect = { ...src, x: src.x + cloned.dx, y: src.y + cloned.dy };
    expect(overlaps(pasted, src)).toBe(false);
    expect(overlaps(pasted, dst)).toBe(false);
  });

  it("pastes the patch off the 8-px grid, inside the frame, on the textured stone wall", () => {
    const { pixels, pasted } = forensicsDemoPixels();
    expect(pasted.x % 8 !== 0 && pasted.y % 8 !== 0).toBe(true);
    expect(pasted.x + pasted.w).toBeLessThanOrEqual(512);
    expect(pasted.y + pasted.h).toBeLessThanOrEqual(384);
    // the wall starts at y = 190; the sky above it is near-flat, which would give ELA nothing to show
    expect(pasted.y).toBeGreaterThanOrEqual(190);
    const g = toGray(pixels);
    let sum = 0;
    let sq = 0;
    for (let y = pasted.y; y < pasted.y + pasted.h; y++) {
      for (let x = pasted.x; x < pasted.x + pasted.w; x++) {
        const v = g[y * 512 + x];
        sum += v;
        sq += v * v;
      }
    }
    const n = pasted.w * pasted.h;
    expect(Math.sqrt(sq / n - (sum / n) ** 2)).toBeGreaterThan(8);
  });
});
