import { describe, expect, it } from "vitest";
import { handleRequest, ops } from "../../src/platform/workers/ops";
import { displayHeatmap, MAP_SIDE } from "../../src/tools/imagekit/heatmap";
import { downscaleValues, makePixels } from "../../src/tools/imagekit/pixels";
import { mulberry32 } from "../../src/tools/imagekit/rng";
import { markRegions } from "../../src/tools/photo/copyMove";
import { dqScore } from "../../src/tools/photo/doubleQuant";
import { elaFinding, elaMap } from "../../src/tools/photo/ela";
import { ijgTable, IJG_LUMA } from "../../src/tools/photo/jpeg";
import { blockSigma, noiseAnalysis, noiseFinding, noiseInconsistency, noiseMap, noiseResidual } from "../../src/tools/photo/noise";

const ELA_LIMIT =
  "Regions much brighter than similar texture nearby were compressed differently. Resaving, resizing and filters also change error levels, so read the map, don't count it.";
const NOISE_LIMIT = "Pasted regions often carry different sensor noise. Smooth areas, blur and heavy compression also lower noise.";

function randomGray(w: number, h: number, seed = 3): Float32Array {
  const rand = mulberry32(seed);
  return Float32Array.from({ length: w * h }, () => 60 + rand() * 120);
}

describe("downscaleValues", () => {
  it("returns the values unchanged when they already fit", () => {
    const v = new Float32Array([1, 2, 3, 4]);
    const out = downscaleValues(v, 2, 2, 4);
    expect(out).toEqual({ values: v, width: 2, height: 2 });
    expect(out.values).toBe(v);
  });

  it("box-averages to the long side, keeping the aspect ratio", () => {
    // 4x2: left half 0, right half 8
    const v = new Float32Array([0, 0, 8, 8, 0, 0, 8, 8]);
    const out = downscaleValues(v, 4, 2, 2);
    expect(out.width).toBe(2);
    expect(out.height).toBe(1);
    expect(Array.from(out.values)).toEqual([0, 8]);
  });

  it("averages uneven boxes without NaN", () => {
    const out = downscaleValues(Float32Array.from({ length: 15 }, (_, i) => i), 5, 3, 2);
    expect(out.width).toBe(2);
    expect(out.height).toBe(1);
    expect(out.values.every(Number.isFinite)).toBe(true);
  });
});

describe("displayHeatmap", () => {
  it("caps the long side at 1600 px", () => {
    expect(MAP_SIDE).toBe(1600);
    const map = displayHeatmap(new Float32Array(3200 * 10).fill(1), 3200, 10);
    expect([map.width, map.height]).toEqual([1600, 5]);
  });

  it("keeps a small map at its own size, so it lines up with the photo", () => {
    const map = displayHeatmap(Float32Array.from({ length: 512 * 384 }, (_, i) => i % 7), 512, 384);
    expect([map.width, map.height]).toEqual([512, 384]);
    expect(map.data.length).toBe(512 * 384 * 4);
  });
});

describe("noiseAnalysis", () => {
  it("gives the same map and inconsistency as the separate functions", () => {
    const g = randomGray(64, 48);
    const a = noiseAnalysis(g, 64, 48);
    expect(Array.from(a.map)).toEqual(Array.from(noiseMap(g, 64, 48)));
    expect(a.inconsistency).toBe(noiseInconsistency(blockSigma(noiseResidual(g, 64, 48), 64, 48).sigma));
  });

  it("is all zeros and null on a 1x1 image", () => {
    const a = noiseAnalysis(new Float32Array([128]), 1, 1);
    expect(Array.from(a.map)).toEqual([0]);
    expect(a.inconsistency).toBeNull();
  });
});

describe("map findings carry no verdict", () => {
  it("elaFinding names the map and ends with the ELA limit sentence", () => {
    const f = elaFinding();
    expect(f.title).toBe("Error levels: map");
    expect(f.body).toContain("quality 90");
    expect(f.body.endsWith(ELA_LIMIT)).toBe(true);
    expect(f.title + f.body).not.toMatch(/consistent|no sign|inconclusive|proves|fake|authentic|identified/i);
  });

  it("noiseFinding states the σ spread as a measurement", () => {
    const f = noiseFinding(0.31234);
    expect(f.title).toBe("Noise residual: map");
    expect(f.detail).toEqual({ kind: "measurement", value: 0.31, unit: "σ spread" });
    expect(f.body).toContain("0.31");
    expect(f.body.endsWith(NOISE_LIMIT)).toBe(true);
    expect(f.title + f.body).not.toMatch(/consistent|no sign|inconclusive|proves|fake|authentic|identified/i);
  });

  it("noiseFinding with no measurement says why, with no NaN", () => {
    const f = noiseFinding(null);
    expect(f.title).toBe("Noise residual: map");
    expect(f.detail).toEqual({ kind: "measurement", value: null, unit: "σ spread" });
    expect(f.body).not.toContain("NaN");
    expect(f.body.endsWith(NOISE_LIMIT)).toBe(true);
  });
});

describe("markRegions", () => {
  it("washes masked pixels amber and dims the rest, scaling the mask up", () => {
    const photo = makePixels(4, 4, [100, 100, 100, 255]);
    // 2x2 mask: only the top-left cell is marked, covering the photo's top-left 2x2
    const out = markRegions(photo, new Uint8Array([1, 0, 0, 0]), 2, 2);
    expect([out.width, out.height]).toEqual([4, 4]);
    const at = (x: number, y: number) => Array.from(out.data.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4));
    const marked = at(1, 1);
    const rest = at(3, 3);
    expect(marked[0]).toBeGreaterThan(marked[2]); // amber: red over blue
    expect(marked[0]).toBeGreaterThan(100);
    expect(rest[0]).toBeLessThan(100);
    expect(rest[0]).toBe(rest[2]); // dimmed, not tinted
    expect(marked[3]).toBe(255);
    expect(rest[3]).toBe(255);
    expect(photo.data[0]).toBe(100); // the photo itself is untouched
  });
});

describe("photo ops", () => {
  it("ela returns the coloured error level map at the photo's size", async () => {
    const a = makePixels(16, 8, [100, 100, 100, 255]);
    const b = makePixels(16, 8, [100, 100, 100, 255]);
    b.data[0] = 110;
    const reply = await handleRequest(ops, { id: 1, op: "ela", payload: { original: a.data, resaved: b.data, width: 16, height: 8 } });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    const r = reply.result as { width: number; height: number; rgba: Uint8ClampedArray };
    expect([r.width, r.height, r.rgba.length]).toEqual([16, 8, 16 * 8 * 4]);
    const expected = displayHeatmap(elaMap(a, b), 16, 8);
    expect(Array.from(r.rgba)).toEqual(Array.from(expected.data));
  });

  it("noise returns the coloured map and the inconsistency", async () => {
    const g = randomGray(64, 48);
    const reply = await handleRequest(ops, { id: 2, op: "noise", payload: { gray: g.slice(), width: 64, height: 48 } });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    const r = reply.result as { width: number; height: number; rgba: Uint8ClampedArray; inconsistency: number | null };
    const a = noiseAnalysis(g, 64, 48);
    expect(r.inconsistency).toBe(a.inconsistency);
    expect([r.width, r.height]).toEqual([64, 48]);
    expect(Array.from(r.rgba)).toEqual(Array.from(displayHeatmap(a.map, 64, 48).data));
  });

  it("dq returns dqScore's value", async () => {
    const g = randomGray(64, 64);
    const luma = ijgTable(IJG_LUMA, 90);
    const reply = await handleRequest(ops, { id: 3, op: "dq", payload: { gray: g, width: 64, height: 64, luma } });
    expect(reply).toEqual({ id: 3, ok: true, result: dqScore(g, 64, 64, luma) });
  });

  it("dq is null for an image with no whole block", async () => {
    const reply = await handleRequest(ops, { id: 4, op: "dq", payload: { gray: new Float32Array([1]), width: 1, height: 1, luma: ijgTable(IJG_LUMA, 90) } });
    expect(reply).toEqual({ id: 4, ok: true, result: null });
  });
});
