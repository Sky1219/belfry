import { describe, expect, test } from "vitest";
import { fft } from "../../src/platform/math/fft";

const close = (a: ArrayLike<number>, b: ArrayLike<number>, eps = 1e-9) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(eps);
};

describe("fft", () => {
  test("a unit impulse has a flat spectrum", () => {
    const re = new Float64Array(8);
    const im = new Float64Array(8);
    re[0] = 1;
    fft(re, im);
    close(re, new Array(8).fill(1));
    close(im, new Array(8).fill(0));
  });

  test("a sine puts its energy in its bin and the mirror bin", () => {
    const n = 64;
    const k = 5;
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * k * i) / n));
    const im = new Float64Array(n);
    fft(re, im);
    const mag = Array.from(re, (r, i) => Math.hypot(r, im[i]));
    expect(mag[k]).toBeCloseTo(n / 2, 9);
    expect(mag[n - k]).toBeCloseTo(n / 2, 9);
    mag.forEach((m, i) => i !== k && i !== n - k && expect(m).toBeLessThan(1e-9));
  });

  test("inverse gives back the input, and energy is conserved (Parseval)", () => {
    const n = 256;
    const x = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.37) + 0.5 * Math.cos(i * 1.9) + ((i * 7919) % 13) / 13);
    const re = x.slice();
    const im = new Float64Array(n);
    fft(re, im);
    const time = x.reduce((s, v) => s + v * v, 0);
    const freq = re.reduce((s, v, i) => s + v * v + im[i] * im[i], 0) / n;
    expect(freq).toBeCloseTo(time, 8);
    fft(re, im, true);
    close(re, x);
    close(im, new Array(n).fill(0));
  });

  test("rejects lengths that aren't a power of two, or that differ", () => {
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow(/power of two/);
    expect(() => fft(new Float64Array(0), new Float64Array(0))).toThrow(/power of two/);
    expect(() => fft(new Float64Array(8), new Float64Array(4))).toThrow(/differ/);
  });
});
