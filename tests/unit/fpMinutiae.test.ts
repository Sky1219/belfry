import { describe, expect, it } from "vitest";
import { handleRequest, ops } from "../../src/platform/workers/ops";
import { extractMinutiae } from "../../src/tools/fingerprint/minutiae";
import { analysePrint } from "../../src/tools/fingerprint/pipeline";
import { synthPrint } from "../../src/tools/fingerprint/synth";

const N = 64;
const FULL_BW = N / 16;

/** A 64 x 64 skeleton with the given polylines drawn 8-connected, and a mask that is all print. */
function draw(lines: Array<Array<[number, number]>>): { skel: Uint8Array; mask: Uint8Array } {
  const skel = new Uint8Array(N * N);
  for (const line of lines) {
    for (let k = 0; k + 1 < line.length; k++) {
      const [x0, y0] = line[k];
      const [x1, y1] = line[k + 1];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= steps; s++) {
        skel[Math.round(y0 + ((y1 - y0) * s) / steps) * N + Math.round(x0 + ((x1 - x0) * s) / steps)] = 1;
      }
    }
  }
  return { skel, mask: new Uint8Array(FULL_BW * FULL_BW).fill(1) };
}

/** Smallest absolute difference between two angles, in degrees. */
function angleGap(a: number, b: number): number {
  const d = Math.abs(((a - b) * 180) / Math.PI) % 360;
  return d > 180 ? 360 - d : d;
}

describe("extractMinutiae", () => {
  it("finds the two ends of a straight line, each pointing outward", () => {
    const { skel, mask } = draw([[[17, 32], [46, 32]]]);
    const m = extractMinutiae(skel, N, N, mask, FULL_BW);
    expect(m).toHaveLength(2);
    expect(m.every((q) => q.kind === "ending")).toBe(true);
    const left = m.find((q) => q.x === 17)!;
    const right = m.find((q) => q.x === 46)!;
    expect(angleGap(left.angle, Math.PI)).toBeLessThan(20);
    expect(angleGap(right.angle, 0)).toBeLessThan(20);
    for (const q of m) {
      expect(q.angle).toBeGreaterThan(-Math.PI);
      expect(q.angle).toBeLessThanOrEqual(Math.PI);
    }
  });

  it("reads a Y as one bifurcation and three endings", () => {
    const { skel, mask } = draw([[[32, 50], [32, 32], [20, 20]], [[32, 32], [44, 20]]]);
    const m = extractMinutiae(skel, N, N, mask, FULL_BW);
    expect(m.filter((q) => q.kind === "bifurcation")).toHaveLength(1);
    expect(m.filter((q) => q.kind === "ending")).toHaveLength(3);
    // The fork opens upward (screen y falls), away from the stem.
    const fork = m.find((q) => q.kind === "bifurcation")!;
    expect(angleGap(fork.angle, -Math.PI / 2)).toBeLessThan(20);
  });

  it("drops an ending that is 5 px from the mask border", () => {
    // Only the left two block columns (x < 32) are print.
    const { skel } = draw([[[14, 24], [27, 24]]]);
    const mask = new Uint8Array(FULL_BW * FULL_BW);
    for (let by = 0; by < FULL_BW; by++) for (let bx = 0; bx < 2; bx++) mask[by * FULL_BW + bx] = 1;
    const m = extractMinutiae(skel, N, N, mask, FULL_BW);
    expect(m.map((q) => q.x)).toEqual([14]); // x = 27 is 5 px from the masked-out block at x = 32
  });

  it("drops an ending within 10 px of the image edge", () => {
    const { skel, mask } = draw([[[6, 32], [40, 32]]]);
    const m = extractMinutiae(skel, N, N, mask, FULL_BW);
    expect(m.map((q) => q.x)).toEqual([40]);
  });

  it("drops both of two endings 4 px apart", () => {
    const { skel, mask } = draw([[[17, 32], [30, 32]], [[34, 32], [47, 32]]]);
    const m = extractMinutiae(skel, N, N, mask, FULL_BW);
    expect(m.map((q) => q.x).sort((a, b) => a - b)).toEqual([17, 47]);
  });
});

describe("analysePrint", () => {
  const print = synthPrint({ seed: 3 });
  const result = analysePrint(print.gray, print.width, print.height);

  it("echoes the size and returns a skeleton of that size", () => {
    expect(result.width).toBe(print.width);
    expect(result.height).toBe(print.height);
    expect(result.skeleton).toHaveLength(print.width * print.height);
  });

  it("finds about as many minutiae as the print has dislocations", () => {
    const n = print.defects.length;
    expect(result.minutiae.length).toBeGreaterThanOrEqual(0.5 * n);
    expect(result.minutiae.length).toBeLessThanOrEqual(1.5 * n);
  });

  it("finds a minutia within 8 px of at least half the dislocations", () => {
    const hit = print.defects.filter((d) => result.minutiae.some((m) => Math.hypot(m.x - d.x, m.y - d.y) <= 8));
    expect(hit.length).toBeGreaterThanOrEqual(0.5 * print.defects.length);
  });
});

describe("the fingerprint op", () => {
  it("runs through handleRequest", async () => {
    const p = synthPrint({ seed: 3 });
    const reply = await handleRequest(ops, {
      id: 1,
      op: "fingerprint",
      payload: { gray: p.gray, width: p.width, height: p.height },
    });
    expect(reply.ok).toBe(true);
  });
});
