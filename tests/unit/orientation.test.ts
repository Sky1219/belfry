import { describe, expect, it } from "vitest";
import { undoOrientation } from "../../src/tools/imagekit/pixels";

type Plane = { gray: Float32Array; width: number; height: number };

/** 3x2 stored image with every value distinct, so no transform maps it onto itself. */
const STORED: Plane = { gray: Float32Array.from([1, 2, 3, 4, 5, 6]), width: 3, height: 2 };

const at = (img: Plane, x: number, y: number) => img.gray[y * img.width + x];

function build(width: number, height: number, value: (x: number, y: number) => number): Plane {
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) gray[y * width + x] = value(x, y);
  return { gray, width, height };
}

// the forward transforms a viewer applies to the stored pixels, built from two primitives
const mirror = (s: Plane) => build(s.width, s.height, (x, y) => at(s, s.width - 1 - x, y));
const rotateCw = (s: Plane) => build(s.height, s.width, (x, y) => at(s, y, s.height - 1 - x));
const times = (n: number, f: (s: Plane) => Plane) => (s: Plane) => Array.from({ length: n }).reduce<Plane>((acc) => f(acc), s);

/** EXIF orientation n: how the stored pixels are turned for display. */
const FORWARD: Record<number, (s: Plane) => Plane> = {
  1: (s) => s,
  2: mirror,
  3: times(2, rotateCw),
  4: (s) => mirror(times(2, rotateCw)(s)),
  5: (s) => mirror(rotateCw(s)),
  6: rotateCw,
  7: (s) => mirror(times(3, rotateCw)(s)),
  8: times(3, rotateCw),
};

describe("undoOrientation", () => {
  it("pins the EXIF meaning of the fixture transforms", () => {
    // 6: rotate 90° clockwise, so the stored bottom-left lands at the top-left
    expect(at(FORWARD[6](STORED), 0, 0)).toBe(at(STORED, 0, 1));
    // 8: rotate 90° anticlockwise, so the stored top-right lands at the top-left
    expect(at(FORWARD[8](STORED), 0, 0)).toBe(at(STORED, 2, 0));
    // 5: transpose
    expect(Array.from(FORWARD[5](STORED).gray)).toEqual([1, 4, 2, 5, 3, 6]);
  });

  for (let o = 1; o <= 8; o++) {
    it(`restores the stored layout for orientation ${o}`, () => {
      const shown = FORWARD[o](STORED);
      const back = undoOrientation(shown.gray, shown.width, shown.height, o);
      expect(back.width).toBe(3);
      expect(back.height).toBe(2);
      expect(Array.from(back.gray)).toEqual(Array.from(STORED.gray));
      expect(back.gray).not.toBe(shown.gray); // a fresh array, safe to transfer
    });
  }

  it("refuses an orientation outside 1-8", () => {
    expect(() => undoOrientation(STORED.gray, 3, 2, 0)).toThrow(RangeError);
    expect(() => undoOrientation(STORED.gray, 3, 2, 9)).toThrow(RangeError);
  });
});
