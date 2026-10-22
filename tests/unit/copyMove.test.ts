import { describe, expect, it } from "vitest";
import { copyMoveFinding, detectCopyMove, type CopyMoveResult } from "../../src/tools/photo/copyMove";
import { handleRequest, ops } from "../../src/platform/workers/ops";
import { mulberry32 } from "../../src/tools/imagekit/rng";

/** 256x256 seeded texture: white noise, box-blurred 3x3, contrast x4 around mid-gray. */
function texture(): Float32Array {
  const w = 256;
  const rand = mulberry32(11);
  const noise = new Float32Array(w * w);
  for (let i = 0; i < noise.length; i++) noise[i] = rand();
  const g = new Float32Array(w * w);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = Math.min(w - 1, Math.max(0, y + dy));
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          s += noise[yy * w + xx];
        }
      }
      g[y * w + x] = 128 + (s / 9 - 0.5) * 4 * 64;
    }
  }
  return g;
}

/** Copies the 48x48 region at (40, 60) to (136, 100). */
function cloned(): Float32Array {
  const g = texture();
  const w = 256;
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) g[(100 + y) * w + 136 + x] = g[(60 + y) * w + 40 + x];
  return g;
}

function coverage(r: CopyMoveResult, x0: number, y0: number, size: number): number {
  let on = 0;
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) if (r.mask[y * r.width + x]) on++;
  return on / (size * size);
}

describe("detectCopyMove", () => {
  it("finds the shift and marks both regions of a cloned patch", () => {
    const r = detectCopyMove(cloned(), 256, 256);
    expect(r.shift).toEqual({ dx: 96, dy: 40 });
    expect(r.blocks).toBeGreaterThanOrEqual(40);
    expect(r.width).toBe(256);
    expect(r.height).toBe(256);
    expect(r.mask).toHaveLength(256 * 256);
    expect(coverage(r, 40, 60, 48)).toBeGreaterThanOrEqual(0.8);
    expect(coverage(r, 136, 100, 48)).toBeGreaterThanOrEqual(0.8);
  });

  it("finds almost nothing in the same texture uncopied", () => {
    const r = detectCopyMove(texture(), 256, 256);
    expect(r.blocks).toBeLessThan(15);
    expect(r.considered).toBeGreaterThan(60000);
  });

  it("reads a flat image as no blocks and no shift", () => {
    const r = detectCopyMove(new Float32Array(64 * 64).fill(128), 64, 64);
    expect(r.blocks).toBe(0);
    expect(r.shift).toBeNull();
    expect(r.considered).toBe(0);
    expect(r.mask.every((v) => v === 0)).toBe(true);
  });

  it("handles an image that is a single block", () => {
    const rand = mulberry32(3);
    const g = Float32Array.from({ length: 64 }, () => rand() * 255);
    const r = detectCopyMove(g, 8, 8);
    expect(r.blocks).toBe(0);
    expect(r.shift).toBeNull();
    expect(r.considered).toBe(1);
  });

  it("handles images smaller than a block", () => {
    const r = detectCopyMove(new Float32Array(9), 3, 3);
    expect(r.blocks).toBe(0);
    expect(r.considered).toBe(0);
    expect(r.mask).toHaveLength(9);
  });

  // A work bound, not a stopwatch (Ruling P4-R13): after the sort, each textured block is compared
  // with at most WINDOW (10) neighbours in each of the two passes, so the work is linear in the blocks.
  it("compares at most 2 x 10 features per textured block at 512x512", () => {
    const small = texture();
    const g = new Float32Array(512 * 512);
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) g[y * 512 + x] = small[(y % 256) * 256 + (x % 256)] + ((x >> 8) + (y >> 8)) * 0.3;
    }
    const r = detectCopyMove(g, 512, 512);
    expect(r.considered).toBeGreaterThan(200000);
    expect(r.comparisons).toBeGreaterThan(0);
    expect(r.comparisons).toBeLessThanOrEqual(2 * 10 * r.considered);
  });

  it("keeps the bound where every block has hundreds of twins, which comparing all of them would make quadratic", () => {
    // a 16 px tile repeated: each block's feature is shared by about 240 others
    const small = texture();
    const g = new Float32Array(256 * 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) g[y * 256 + x] = small[(y % 16) * 256 + (x % 16)];
    const r = detectCopyMove(g, 256, 256);
    expect(r.considered).toBeGreaterThan(60000);
    expect(r.comparisons).toBeLessThanOrEqual(2 * 10 * r.considered);
    // the window is what stops it, not a lack of twins: both passes run it full
    expect(r.comparisons).toBeGreaterThan(19 * r.considered);
    expect(r.shift).not.toBeNull();
  });
});

describe("copyMove op", () => {
  it("returns the same shift through handleRequest", async () => {
    const reply = await handleRequest(ops, { id: 1, op: "copyMove", payload: { gray: cloned(), width: 256, height: 256 } });
    expect(reply.ok).toBe(true);
    if (reply.ok) expect((reply.result as CopyMoveResult).shift).toEqual({ dx: 96, dy: 40 });
  });
});

describe("copyMoveFinding", () => {
  const result = (blocks: number, considered = 5000, shift: CopyMoveResult["shift"] = { dx: 96, dy: 40 }): CopyMoveResult => ({
    width: 256,
    height: 256,
    shift,
    blocks,
    considered,
    comparisons: 0,
    mask: new Uint8Array(0),
  });
  const LIMIT = "Repeating textures (brick, tiles, foliage) can match themselves.";

  it("is consistent with cloned regions from 40 blocks", () => {
    const f = copyMoveFinding(result(52));
    expect(f.title).toBe("Copy-move: consistent with cloned regions");
    expect(f.detail).toEqual({ kind: "measurement", value: 52, unit: "matching blocks" });
    expect(f.body).toContain("52");
    expect(f.body).toContain("(96, 40) px");
    expect(f.body).toContain("40");
    expect(f.body.endsWith(LIMIT)).toBe(true);
  });

  it("is inconclusive from 15 to 39 blocks", () => {
    expect(copyMoveFinding(result(20)).title).toBe("Copy-move: inconclusive");
    expect(copyMoveFinding(result(39)).title).toBe("Copy-move: inconclusive");
    expect(copyMoveFinding(result(15)).title).toBe("Copy-move: inconclusive");
  });

  it("finds no sign below 15 blocks of a textured image", () => {
    const f = copyMoveFinding(result(0, 5000, null));
    expect(f.title).toBe("Copy-move: no sign of cloned regions");
    expect(f.detail).toEqual({ kind: "measurement", value: 0, unit: "matching blocks" });
    expect(f.body).not.toContain("px");
    expect(f.body.endsWith(LIMIT)).toBe(true);
  });

  it("is inconclusive with too little texture, whatever the block count", () => {
    for (const blocks of [0, 52]) {
      const f = copyMoveFinding(result(blocks, 63));
      expect(f.title).toBe("Copy-move: inconclusive");
      expect(f.body).toContain("too little texture to compare");
      expect(f.detail).toBeUndefined();
    }
    expect(copyMoveFinding(result(0, 64, null)).title).toBe("Copy-move: no sign of cloned regions");
  });

  it("returns its verdict, so only a consistent result marks the photo (Ruling R16)", () => {
    expect(copyMoveFinding(result(52)).verdict).toBe("consistent");
    expect(copyMoveFinding(result(20)).verdict).toBe("inconclusive");
    expect(copyMoveFinding(result(52, 63)).verdict).toBe("inconclusive");
    expect(copyMoveFinding(result(3)).verdict).toBe("no-sign");
  });

  it("reads the flat 64x64 and 8x8 images as inconclusive", () => {
    for (const n of [64, 8]) {
      const r = detectCopyMove(new Float32Array(n * n).fill(90), n, n);
      expect(r.considered).toBeLessThan(64);
      const f = copyMoveFinding(r);
      expect(f.title).toBe("Copy-move: inconclusive");
      expect(f.body).toContain("too little texture to compare");
    }
  });
});
