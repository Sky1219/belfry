import { describe, expect, test } from "vitest";
import { dominantColorName } from "../../src/tools/detective/features/color";
import { localNote } from "../../src/tools/detective/features/localNote";

const solid = (r: number, g: number, b: number, n = 100) => {
  const px = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < px.length; i += 4) px.set([r, g, b, 255], i);
  return { px, w: n, h: n };
};

describe("local notes", () => {
  test("names primary colors", () => {
    const name = (r: number, g: number, b: number) => {
      const s = solid(r, g, b);
      return dominantColorName(s.px, s.w, s.h);
    };
    expect(name(200, 30, 30)).toBe("red");
    expect(name(30, 180, 40)).toBe("green");
    expect(name(30, 60, 200)).toBe("blue");
    expect(name(230, 220, 40)).toBe("yellow");
    expect(name(240, 140, 30)).toBe("orange");
    expect(name(20, 20, 20)).toBe("black");
    expect(name(240, 240, 240)).toBe("white");
    expect(name(128, 128, 128)).toBe("gray");
    expect(name(120, 70, 30)).toBe("brown");
    expect(name(140, 50, 200)).toBe("purple");
    expect(name(240, 120, 180)).toBe("pink");
    expect(name(40, 200, 210)).toBe("cyan");
  });

  test("formats size, position and confidence", () => {
    expect(localNote({ label: "cup", score: 0.82, color: "red", box: [0.05, 0.7, 0.2, 0.85], tVisibleS: 14 })).toBe(
      "CUP — red, small, lower left of frame. In view 14 s. Detector confidence 82%.",
    );
    expect(localNote({ label: null, score: null, color: "gray", box: [0.3, 0.3, 0.7, 0.7], tVisibleS: 0 })).toBe(
      "UNIDENTIFIED OBJECT — gray, medium, center of frame.",
    );
  });
});
