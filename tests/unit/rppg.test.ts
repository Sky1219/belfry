import { describe, expect, test } from "vitest";
import { HeartRateEstimator } from "../../src/tools/detective/features/rppg";

/** Deterministic RNG (mulberry32) + Gaussian via Box–Muller. */
function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
  return { u, gauss };
}

interface SynthOpts {
  bpm: number | null; // null = no pulse
  seconds: number;
  startMs?: number;
  seed?: number;
  dropRate?: number;
}

/** Skin-color samples at ~30 fps with ±5 ms jitter: pulse (G 0.5%, R/B 0.2%), noise σ 0.3%, 5% drift over 10 s. */
function synth({ bpm, seconds, startMs = 0, seed = 1, dropRate = 0 }: SynthOpts): Array<[number, [number, number, number]]> {
  const r = rng(seed);
  const base = [150, 110, 90];
  const out: Array<[number, [number, number, number]]> = [];
  const n = Math.round(seconds * 30);
  for (let i = 0; i < n; i++) {
    const t = startMs + i * (1000 / 30) + (r.u() - 0.5) * 10;
    if (r.u() < dropRate) continue;
    const s = (t - startMs) / 1000;
    const pulse = bpm ? Math.sin(2 * Math.PI * (bpm / 60) * s) : 0;
    const drift = 1 + 0.05 * (s / 10);
    const amp = [0.002, 0.005, 0.002];
    const rgb = base.map((b, c) => b * drift * (1 + amp[c] * pulse + 0.003 * r.gauss())) as [number, number, number];
    out.push([t, rgb]);
  }
  return out;
}

const feed = (est: HeartRateEstimator, samples: Array<[number, [number, number, number]]>) => samples.forEach(([t, rgb]) => est.push(t, rgb));

describe("HeartRateEstimator (POS)", () => {
  test("estimates 72 BPM within ±3", () => {
    const est = new HeartRateEstimator();
    feed(est, synth({ bpm: 72, seconds: 10 }));
    const r = est.estimate();
    expect(r).not.toBeNull();
    expect(Math.abs(r!.bpm - 72)).toBeLessThanOrEqual(3);
  });

  test("estimates 110 BPM within ±3", () => {
    const est = new HeartRateEstimator();
    feed(est, synth({ bpm: 110, seconds: 10, seed: 7 }));
    const r = est.estimate();
    expect(r).not.toBeNull();
    expect(Math.abs(r!.bpm - 110)).toBeLessThanOrEqual(3);
  });

  test("returns null before 6 s", () => {
    const est = new HeartRateEstimator();
    feed(est, synth({ bpm: 72, seconds: 5 }));
    expect(est.estimate()).toBeNull();
  });

  test("returns null on pure noise", () => {
    for (const seed of [3, 4, 5]) {
      const est = new HeartRateEstimator();
      feed(est, synth({ bpm: null, seconds: 10, seed }));
      expect(est.estimate(), `seed ${seed}`).toBeNull();
    }
  });

  test("a gap longer than 1 s resets the buffer", () => {
    const est = new HeartRateEstimator();
    feed(est, synth({ bpm: 72, seconds: 8 }));
    feed(est, synth({ bpm: 120, seconds: 3, startMs: 10_000, seed: 9 }));
    expect(est.estimate()).toBeNull();
  });

  test("streaming pure noise never produces a stable reading", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const est = new HeartRateEstimator();
      const samples = synth({ bpm: null, seconds: 60, seed });
      let shown = 0;
      let nextCall = 0;
      for (const [t, rgb] of samples) {
        est.push(t, rgb);
        if (t >= nextCall) {
          if (est.reading(t)) shown++;
          nextCall = t + 500;
        }
      }
      expect(shown, `seed ${seed}`).toBe(0);
    }
  });

  test("streaming 72 BPM gives a stable reading within ±3 after the window fills", () => {
    const est = new HeartRateEstimator();
    let last: ReturnType<HeartRateEstimator["reading"]> = null;
    let nextCall = 0;
    for (const [t, rgb] of synth({ bpm: 72, seconds: 20, seed: 21 })) {
      est.push(t, rgb);
      if (t >= nextCall) {
        last = est.reading(t) ?? last;
        nextCall = t + 500;
      }
    }
    expect(last).not.toBeNull();
    expect(Math.abs(last!.bpm - 72)).toBeLessThanOrEqual(3);
  });

  test("tolerates 10% dropped frames", () => {
    const est = new HeartRateEstimator();
    feed(est, synth({ bpm: 72, seconds: 10, seed: 11, dropRate: 0.1 }));
    const r = est.estimate();
    expect(r).not.toBeNull();
    expect(Math.abs(r!.bpm - 72)).toBeLessThanOrEqual(3);
  });
});
