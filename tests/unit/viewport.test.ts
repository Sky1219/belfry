import { describe, expect, test } from "vitest";
import { coverFit, shaderUv, toScreen, toSource } from "../../src/platform/viewport";

const DST = { w: 1600, h: 900 };
const SOURCES = [
  { name: "16:9", w: 1280, h: 720 },
  { name: "4:3", w: 640, h: 480 },
  { name: "9:16", w: 720, h: 1280 },
];

describe("viewport", () => {
  test.each(SOURCES)("coverFit fills the destination without stretching ($name)", ({ w, h }) => {
    const v = coverFit(w, h, DST.w, DST.h, false);
    const dispW = w * v.scale;
    const dispH = h * v.scale;
    expect(dispW).toBeGreaterThanOrEqual(DST.w - 1e-6);
    expect(dispH).toBeGreaterThanOrEqual(DST.h - 1e-6);
    expect(Math.min(dispW - DST.w, dispH - DST.h)).toBeCloseTo(0, 6); // tight on one axis
    expect(dispW / dispH).toBeCloseTo(w / h, 9);
    expect(v.offsetX).toBeCloseTo((DST.w - dispW) / 2, 9);
    expect(v.offsetY).toBeCloseTo((DST.h - dispH) / 2, 9);
  });

  test("toSource inverts toScreen", () => {
    for (const s of SOURCES) {
      for (const mirror of [false, true]) {
        const v = coverFit(s.w, s.h, DST.w, DST.h, mirror);
        for (let i = 0; i <= 4; i++) {
          for (let j = 0; j <= 4; j++) {
            const nx = i / 4;
            const ny = j / 4;
            const p = toScreen(v, nx, ny);
            const back = toSource(v, p.x, p.y);
            expect(back.nx).toBeCloseTo(nx, 9);
            expect(back.ny).toBeCloseTo(ny, 9);
          }
        }
      }
    }
  });

  test("mirroring flips x only", () => {
    const a = coverFit(1280, 720, DST.w, DST.h, false);
    const b = coverFit(1280, 720, DST.w, DST.h, true);
    const pa = toScreen(a, 0.2, 0.3);
    const pb = toScreen(b, 0.2, 0.3);
    expect(pb.y).toBeCloseTo(pa.y, 9);
    expect(pb.x).toBeCloseTo(DST.w - pa.x, 9);
  });

  test("shaderUv maps screen corners to the visible source rectangle", () => {
    for (const s of SOURCES) {
      for (const mirror of [false, true]) {
        const v = coverFit(s.w, s.h, DST.w, DST.h, mirror);
        const { scale, offset } = shaderUv(v);
        for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          let u = sx * scale[0] + offset[0];
          const t = sy * scale[1] + offset[1];
          if (mirror) u = 1 - u;
          const expected = toSource(v, sx * DST.w, sy * DST.h);
          expect(u).toBeCloseTo(expected.nx, 9);
          expect(t).toBeCloseTo(expected.ny, 9);
        }
      }
    }
  });
});
