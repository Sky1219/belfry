import { describe, expect, it } from "vitest";
import { synthPrint } from "../../src/tools/fingerprint/synth";
import { normalize, orientationField, segmentMask } from "../../src/tools/fingerprint/orientation";

/** Angular distance between two directions, mod pi, in degrees. */
function angErr(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return (d * 180) / Math.PI;
}

function stats(a: Float32Array): { mean: number; variance: number } {
  let m = 0;
  for (const v of a) m += v;
  m /= a.length;
  let s = 0;
  for (const v of a) s += (v - m) * (v - m);
  return { mean: m, variance: s / a.length };
}

describe("synthPrint", () => {
  it("is deterministic per seed and differs between seeds", () => {
    const a = synthPrint({ seed: 3 });
    const b = synthPrint({ seed: 3 });
    expect(a.width).toBe(320);
    expect(a.height).toBe(400);
    expect(Array.from(a.gray)).toEqual(Array.from(b.gray));
    expect(a.defects).toEqual(b.defects);
    expect(Array.from(synthPrint({ seed: 4 }).gray)).not.toEqual(Array.from(a.gray));
  });

  it("keeps grey levels in 0-255 and places 30 defects inside the frame", () => {
    const p = synthPrint({ seed: 3 });
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of p.gray) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(255);
    expect(p.defects).toHaveLength(30);
    for (const d of p.defects) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThan(p.width);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThan(p.height);
    }
  });

  it("reports orientations in [0, pi)", () => {
    const p = synthPrint({ seed: 3 });
    for (let y = 0; y < p.height; y += 37) {
      for (let x = 0; x < p.width; x += 29) {
        const t = p.orientationAt(x, y);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThan(Math.PI);
      }
    }
  });

  it("transforms pixels, defects and orientations together under a shift", () => {
    const base = synthPrint({ seed: 5, noise: 0 });
    const moved = synthPrint({ seed: 5, noise: 0, dx: 12, dy: -7 });
    const { width: w } = base;
    for (const [x, y] of [[100, 150], [200, 300], [60, 220]]) {
      expect(moved.gray[(y - 7) * w + (x + 12)]).toBeCloseTo(base.gray[y * w + x], 3);
      expect(angErr(moved.orientationAt(x + 12, y - 7), base.orientationAt(x, y))).toBeLessThan(1e-6);
    }
    for (const d of base.defects) {
      const x = d.x + 12;
      const y = d.y - 7;
      if (x < 0 || x >= w || y < 0 || y >= base.height) continue;
      expect(moved.defects.some((m) => Math.abs(m.x - x) < 1e-9 && Math.abs(m.y - y) < 1e-9)).toBe(true);
    }
  });

  it("transforms pixels, defects and orientations together under a 180 degree turn", () => {
    const base = synthPrint({ seed: 5, noise: 0 });
    const turned = synthPrint({ seed: 5, noise: 0, rotateDeg: 180 });
    const { width: w, height: h } = base;
    for (const [x, y] of [[100, 150], [200, 300], [60, 220]]) {
      expect(turned.gray[(h - y) * w + (w - x)]).toBeCloseTo(base.gray[y * w + x], 2);
      expect(angErr(turned.orientationAt(w - x, h - y), base.orientationAt(x, y))).toBeLessThan(1e-6);
    }
    expect(turned.defects).toHaveLength(base.defects.length);
    for (const d of base.defects) {
      expect(
        turned.defects.some((m) => Math.abs(m.x - (w - d.x)) < 1e-6 && Math.abs(m.y - (h - d.y)) < 1e-6),
      ).toBe(true);
    }
  });

  it("turns the ridge direction by the rotation angle", () => {
    const base = synthPrint({ seed: 5, noise: 0 });
    const turned = synthPrint({ seed: 5, noise: 0, rotateDeg: 90 });
    // out = c + R(src - c); a source point maps to (cx - (sy - cy), cy + (sx - cx)).
    const cx = base.width / 2;
    const cy = base.height / 2;
    const sx = 100;
    const sy = 150;
    const ox = cx - (sy - cy);
    const oy = cy + (sx - cx);
    expect(angErr(turned.orientationAt(ox, oy), base.orientationAt(sx, sy) + Math.PI / 2)).toBeLessThan(1e-6);
  });
});

describe("normalize", () => {
  it("gives mean 0 and variance 1", () => {
    const n = normalize(synthPrint({ seed: 3 }).gray);
    const s = stats(n);
    expect(Math.abs(s.mean)).toBeLessThan(1e-6);
    expect(Math.abs(s.variance - 1)).toBeLessThan(1e-6);
  });

  it("maps a flat image to zeros", () => {
    const n = normalize(new Float32Array(64).fill(90));
    expect(Array.from(n).every((v) => v === 0)).toBe(true);
  });
});

/** A print with a blank border, as the grayscale a photo of a pad would give. */
function bordered(seed: number, border: number) {
  const p = synthPrint({ seed });
  const gray = Float32Array.from(p.gray);
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (x < border || y < border || x >= p.width - border || y >= p.height - border) {
        gray[y * p.width + x] = 127;
      }
    }
  }
  return { ...p, gray };
}

describe("segmentMask", () => {
  it("masks out a blank border and keeps the ridged interior", () => {
    const p = bordered(3, 32);
    const { mask, bw, bh } = segmentMask(normalize(p.gray), p.width, p.height);
    expect(bw).toBe(20);
    expect(bh).toBe(25);
    let interior = 0;
    let kept = 0;
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const edge = bx < 2 || by < 2 || bx >= bw - 2 || by >= bh - 2;
        if (edge) expect(mask[by * bw + bx]).toBe(0);
        else {
          interior++;
          kept += mask[by * bw + bx];
        }
      }
    }
    expect(kept / interior).toBeGreaterThanOrEqual(0.9);
  });

  it("leaves out partial blocks at the right and bottom", () => {
    const { bw, bh, mask } = segmentMask(new Float32Array(50 * 40), 50, 40);
    expect([bw, bh, mask.length]).toEqual([3, 2, 6]);
  });
});

describe("orientationField", () => {
  it("recovers the ridge direction at masked block centres", () => {
    const p = synthPrint({ seed: 3 });
    const norm = normalize(p.gray);
    const { mask, bw, bh } = segmentMask(norm, p.width, p.height);
    const { theta, coherence } = orientationField(norm, p.width, p.height);
    expect(theta).toHaveLength(bw * bh);
    let used = 0;
    let good = 0;
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const i = by * bw + bx;
        if (!mask[i]) continue;
        used++;
        const truth = p.orientationAt(bx * 16 + 8, by * 16 + 8);
        if (angErr(theta[i], truth) < 15) good++;
        expect(theta[i]).toBeGreaterThanOrEqual(0);
        expect(theta[i]).toBeLessThan(Math.PI);
        expect(coherence[i]).toBeGreaterThanOrEqual(0);
        expect(coherence[i]).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
    expect(used).toBeGreaterThan(0.8 * bw * bh);
    expect(good / used).toBeGreaterThanOrEqual(0.85);
  });

  it("reads straight horizontal ridges as direction 0 with coherence near 1", () => {
    const w = 64;
    const gray = new Float32Array(w * w);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) gray[y * w + x] = 127 + 100 * Math.cos((2 * Math.PI * y) / 8);
    }
    const { theta, coherence } = orientationField(normalize(gray), w, w);
    for (let i = 0; i < theta.length; i++) {
      expect(angErr(theta[i], 0)).toBeLessThan(1);
      expect(coherence[i]).toBeGreaterThan(0.95);
    }
  });

  it("gives zero coherence on a flat image", () => {
    const { coherence } = orientationField(new Float32Array(32 * 32), 32, 32);
    expect(Array.from(coherence).every((c) => c === 0)).toBe(true);
  });
});
