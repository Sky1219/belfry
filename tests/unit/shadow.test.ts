import { describe, expect, it } from "vitest";
import { angularDistanceDeg } from "../../src/tools/shadow/geo";
import {
  elevationFromMarks,
  normalizeBearing,
  parseOffset,
  photoTimeUtc,
  shadowFinding,
  solveShadow,
  type Pt,
  type ShadowFix,
} from "../../src/tools/shadow/shadow";
import { solarPosition, subsolarPoint, type LatLon } from "../../src/tools/shadow/solar";

type Marks = { base: Pt; top: Pt; tip: Pt };

const LIMIT =
  "Assumes a vertical object on level ground, seen without strong perspective. Any place on this circle saw the sun at this height at that moment.";

/** What a camera at `obs` would see at `when`: a 200 px upright object and the shadow it casts, plus the sun's true position. */
function scene(obs: LatLon, when: Date, objectPx = 200) {
  const sun = solarPosition(when, obs.lat, obs.lon);
  const shadowPx = objectPx / Math.tan((sun.elevationDeg * Math.PI) / 180);
  const marks: Marks = {
    base: { x: 100, y: 400 },
    top: { x: 100, y: 400 - objectPx },
    tip: { x: 100 + shadowPx, y: 400 },
  };
  return { marks, sun, bearing: sun.azimuthDeg + 180 };
}

const DEMO = { lat: 51.5, lon: -0.12 };
const DEMO_TIME = new Date("2026-06-21T14:00:00Z");

describe("elevationFromMarks", () => {
  it("is 45 degrees for equal object and shadow, with an uncertainty from the mark error", () => {
    const r = elevationFromMarks({ base: { x: 100, y: 300 }, top: { x: 100, y: 200 }, tip: { x: 200, y: 300 } });
    if ("error" in r) throw new Error(r.error);
    expect(r.elevationDeg).toBeCloseTo(45, 9);
    expect(r.uncertaintyDeg).toBeGreaterThan(1.5);
    expect(r.uncertaintyDeg).toBeLessThan(4);
  });

  it("grows the uncertainty with the pixel sigma", () => {
    const m = { base: { x: 100, y: 300 }, top: { x: 100, y: 200 }, tip: { x: 200, y: 300 } };
    const a = elevationFromMarks(m, 1);
    const b = elevationFromMarks(m, 3);
    if ("error" in a || "error" in b) throw new Error("unexpected error");
    expect(b.uncertaintyDeg).toBeGreaterThan(a.uncertaintyDeg * 2.5);
  });

  it("refuses an object under 5 px as degenerate", () => {
    const r = elevationFromMarks({ base: { x: 100, y: 300 }, top: { x: 100, y: 295 }, tip: { x: 200, y: 300 } });
    expect(r).toEqual({ error: "degenerate", message: "Mark the object's base, its top and the tip of its shadow." });
  });

  it("refuses a shadow under 5 px as degenerate", () => {
    const r = elevationFromMarks({ base: { x: 100, y: 300 }, top: { x: 100, y: 200 }, tip: { x: 103, y: 300 } });
    expect(r).toMatchObject({ error: "degenerate" });
  });

  it("refuses a low sun (long shadow)", () => {
    const r = elevationFromMarks({ base: { x: 0, y: 300 }, top: { x: 0, y: 280 }, tip: { x: 400, y: 300 } });
    expect(r).toEqual({ error: "too-low", message: "The sun is too low for a reliable fix." });
  });

  it("is degenerate, with no NaN or Infinity, when all three marks sit on one point", () => {
    const p = { x: 50, y: 50 };
    const r = elevationFromMarks({ base: p, top: { ...p }, tip: { ...p } });
    expect(r).toMatchObject({ error: "degenerate" });
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity|null/);
  });

  it("is degenerate for non-finite marks", () => {
    const r = elevationFromMarks({ base: { x: NaN, y: 0 }, top: { x: 0, y: -100 }, tip: { x: 100, y: 0 } });
    expect(r).toMatchObject({ error: "degenerate" });
  });

  it("applies the 5 degree limit to the elevation as displayed", () => {
    // 4.96 degrees reads "5.0": what is shown and what is decided agree.
    const at = (deg: number) => ({
      base: { x: 0, y: 300 },
      top: { x: 0, y: -700 },
      tip: { x: 1000 / Math.tan((deg * Math.PI) / 180), y: 300 },
    });
    expect(elevationFromMarks(at(4.96))).not.toHaveProperty("error");
    expect(elevationFromMarks(at(4.9))).toMatchObject({ error: "too-low" });
  });
});

describe("photo time", () => {
  it("turns local time plus offset into UTC", () => {
    const t = photoTimeUtc({ dateTimeOriginal: "2026:06:21 15:00:00", offsetTimeOriginal: "+01:00" });
    expect(t?.toISOString()).toBe("2026-06-21T14:00:00.000Z");
    const west = photoTimeUtc({ dateTimeOriginal: "2026:06:21 23:30:00", offsetTimeOriginal: "-03:30" });
    expect(west?.toISOString()).toBe("2026-06-22T03:00:00.000Z");
  });

  it("returns null without an offset: it never guesses one", () => {
    expect(photoTimeUtc({ dateTimeOriginal: "2026:06:21 15:00:00" })).toBeNull();
    expect(photoTimeUtc({ dateTimeOriginal: "2026:06:21 15:00:00", offsetTimeOriginal: "" })).toBeNull();
    expect(photoTimeUtc({ offsetTimeOriginal: "+01:00" })).toBeNull();
  });

  it("returns null for dates that do not exist", () => {
    expect(photoTimeUtc({ dateTimeOriginal: "2026:13:40 99:00:00", offsetTimeOriginal: "+00:00" })).toBeNull();
    expect(photoTimeUtc({ dateTimeOriginal: "2026:02:30 10:00:00", offsetTimeOriginal: "+00:00" })).toBeNull();
    expect(photoTimeUtc({ dateTimeOriginal: "garbage", offsetTimeOriginal: "+00:00" })).toBeNull();
    expect(photoTimeUtc({ dateTimeOriginal: "2026:06:21 15:00:00", offsetTimeOriginal: "nope" })).toBeNull();
  });

  it("parses offsets in minutes", () => {
    expect(parseOffset("+05:30")).toBe(330);
    expect(parseOffset("-03:30")).toBe(-210);
    expect(parseOffset("+00:00")).toBe(0);
    expect(parseOffset("+14:00")).toBe(840);
    expect(parseOffset("+25:00")).toBeNull();
    expect(parseOffset("+01:75")).toBeNull();
    expect(parseOffset("1:00")).toBeNull();
    expect(parseOffset("")).toBeNull();
  });
});

describe("normalizeBearing", () => {
  it("wraps into [0, 360)", () => {
    expect(normalizeBearing(-30)).toBe(330);
    expect(normalizeBearing(390)).toBe(30);
    expect(normalizeBearing(360)).toBe(0);
    expect(normalizeBearing(0)).toBe(0);
    expect(normalizeBearing(-720)).toBe(0);
  });
});

describe("solveShadow", () => {
  it("finds the demo location from marks, time and a bearing", () => {
    const { marks, sun, bearing } = scene(DEMO, DEMO_TIME);
    const fix = solveShadow({ marks, timeUtc: DEMO_TIME, shadowBearingDeg: bearing });
    if ("error" in fix) throw new Error(fix.error);
    expect(Math.abs(fix.elevationDeg - sun.elevationDeg)).toBeLessThan(1e-9);
    expect(fix.points).toHaveLength(1);
    expect(angularDistanceDeg(fix.points[0], DEMO)).toBeLessThan(0.5);
    // the geometry runs on the geometric elevation, not the apparent one that was measured
    expect(fix.zenithDeg).toBeCloseTo(90 - sun.geometricElevationDeg, 6);
    expect(fix.subsolar).toEqual(subsolarPoint(DEMO_TIME));
    expect(fix.timeUtc).toEqual(DEMO_TIME);
  });

  it("gives no point without a bearing", () => {
    const { marks } = scene(DEMO, DEMO_TIME);
    const fix = solveShadow({ marks, timeUtc: DEMO_TIME });
    if ("error" in fix) throw new Error(fix.error);
    expect(fix.points).toEqual([]);
  });

  it("accepts a bearing typed as -30 or 390 the same as 330 or 30", () => {
    const { marks, bearing } = scene(DEMO, DEMO_TIME);
    const a = solveShadow({ marks, timeUtc: DEMO_TIME, shadowBearingDeg: bearing });
    const b = solveShadow({ marks, timeUtc: DEMO_TIME, shadowBearingDeg: bearing - 360 });
    const c = solveShadow({ marks, timeUtc: DEMO_TIME, shadowBearingDeg: bearing + 720 });
    if ("error" in a || "error" in b || "error" in c) throw new Error("unexpected error");
    expect(b.points).toEqual(a.points);
    expect(c.points[0].lat).toBeCloseTo(a.points[0].lat, 9);
  });

  it("returns both places when the photo fits two (London, 06:00Z)", () => {
    const when = new Date("2026-06-21T06:00:00Z");
    const { marks, bearing } = scene(DEMO, when);
    const fix = solveShadow({ marks, timeUtc: when, shadowBearingDeg: bearing });
    if ("error" in fix) throw new Error(fix.error);
    expect(fix.points).toHaveLength(2);
    expect(fix.points.some((p) => angularDistanceDeg(p, DEMO) < 0.5)).toBe(true);
  });

  it("returns both places when they are far apart (Reykjavik, 06:00Z)", () => {
    const rey = { lat: 64.15, lon: -21.94 };
    const when = new Date("2026-06-21T06:00:00Z");
    const { marks, bearing } = scene(rey, when);
    const fix = solveShadow({ marks, timeUtc: when, shadowBearingDeg: bearing });
    if ("error" in fix) throw new Error(fix.error);
    expect(fix.points).toHaveLength(2);
    expect(fix.points.some((p) => angularDistanceDeg(p, rey) < 0.5)).toBe(true);
    expect(angularDistanceDeg(fix.points[0], fix.points[1])).toBeGreaterThan(30);
  });

  it("says so when the bearing fits no place at that sun height", () => {
    // Only some sun azimuths are possible on a circle that does not enclose a pole.
    const when = new Date("2026-06-21T06:00:00Z");
    const { marks } = scene(DEMO, when);
    const results = Array.from({ length: 72 }, (_, i) => solveShadow({ marks, timeUtc: when, shadowBearingDeg: i * 5 }));
    const refused = results.filter((r) => "error" in r);
    expect(refused.length).toBeGreaterThan(0);
    for (const r of refused) expect(r).toEqual({ error: "That bearing doesn't fit this sun height at that time." });
  });

  it("passes the marks' refusals through as messages", () => {
    const p = { x: 5, y: 5 };
    expect(solveShadow({ marks: { base: p, top: { ...p }, tip: { ...p } }, timeUtc: DEMO_TIME })).toEqual({
      error: "Mark the object's base, its top and the tip of its shadow.",
    });
    expect(
      solveShadow({
        marks: { base: { x: 0, y: 300 }, top: { x: 0, y: 280 }, tip: { x: 400, y: 300 } },
        timeUtc: DEMO_TIME,
      }),
    ).toEqual({ error: "The sun is too low for a reliable fix." });
  });

  it("refuses an invalid time instead of returning NaN", () => {
    const { marks } = scene(DEMO, DEMO_TIME);
    const r = solveShadow({ marks, timeUtc: new Date("nonsense"), shadowBearingDeg: 100 });
    expect(r).toHaveProperty("error");
  });
});

describe("shadowFinding", () => {
  const base = (over: Partial<ShadowFix>): ShadowFix => ({
    timeUtc: DEMO_TIME,
    elevationDeg: 52.31,
    uncertaintyDeg: 2.06,
    subsolar: { lat: 23.4, lon: -30 },
    zenithDeg: 37.9,
    points: [],
    ...over,
  });

  it("without a bearing reports the sun elevation and its circle", () => {
    const f = shadowFinding(base({}));
    expect(f.title).toBe("Sun elevation: 52.3° ± 2.1°");
    expect(f.detail).toEqual({ kind: "measurement", value: 52.31, unit: "° sun elevation", uncertainty: 2.06 });
    expect(f.meta.sunLocus).toEqual({ subsolarLat: 23.4, subsolarLon: -30, zenithDeg: 37.9, bandDeg: 2.06 });
    expect(f.meta.points).toBeUndefined();
    expect(f.body).toContain("2026-06-21 14:00 UTC");
    expect(f.body).toContain("52.3° ± 2.1°");
    expect(f.body.endsWith(LIMIT)).toBe(true);
  });

  it("with one place gives a location with a radius from the uncertainty", () => {
    const f = shadowFinding(base({ points: [{ lat: 51.5, lon: -0.12 }], uncertaintyDeg: 1.1 }));
    expect(f.title).toBe("Shadow fix: 51.5° N, 0.1° W");
    expect(f.detail).toEqual({ kind: "location", lat: 51.5, lon: -0.12, radiusM: Math.round(1.1 * 111195) });
    expect(f.meta.sunLocus.bandDeg).toBe(1.1);
    expect(f.body).toContain("2026-06-21 14:00 UTC");
    expect(f.body.endsWith(LIMIT)).toBe(true);
  });

  it("names the hemispheres", () => {
    const f = shadowFinding(base({ points: [{ lat: -33.87, lon: 151.21 }] }));
    expect(f.title).toBe("Shadow fix: 33.9° S, 151.2° E");
  });

  it("with two places lists both, keeps the elevation as the detail and both points in meta", () => {
    const pts = [
      { lat: 51.5, lon: -0.12 },
      { lat: -12.34, lon: 120.06 },
    ];
    const f = shadowFinding(base({ points: pts }));
    expect(f.title).toBe("Shadow fix: two possible places");
    expect(f.body).toContain("51.5° N, 0.1° W");
    expect(f.body).toContain("12.3° S, 120.1° E");
    expect(f.body).toMatch(/same height and direction/);
    expect(f.body).toContain("2026-06-21 14:00 UTC");
    expect(f.body.endsWith(LIMIT)).toBe(true);
    expect(f.detail).toEqual({ kind: "measurement", value: 52.31, unit: "° sun elevation", uncertainty: 2.06 });
    expect(f.meta.points).toEqual(pts);
    expect(f.meta.sunLocus.bandDeg).toBe(2.06);
  });

  it("builds a coherent finding from a real solve, in both the one and two place cases", () => {
    for (const hour of [14, 6]) {
      const when = new Date(Date.UTC(2026, 5, 21, hour));
      const { marks, bearing } = scene(DEMO, when);
      const fix = solveShadow({ marks, timeUtc: when, shadowBearingDeg: bearing });
      if ("error" in fix) throw new Error(fix.error);
      const f = shadowFinding(fix);
      expect(f.title).toBe(fix.points.length === 1 ? "Shadow fix: 51.5° N, 0.1° W" : "Shadow fix: two possible places");
      expect(f.body).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});

// Ruling P4-R1: the stated uncertainty must cover the error the marks actually make.
describe("uncertainty coverage", () => {
  const mulberry32 = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const noises: [string, (rnd: () => number) => number][] = [
    ["uniform ±3 px", (rnd) => (rnd() * 2 - 1) * 3],
    ["gaussian σ=1.5 px", (rnd) => 1.5 * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())],
  ];

  for (const [name, noise] of noises) {
    it(`covers the true elevation and place in at least 90% of 200 trials (${name})`, () => {
      const { marks, sun, bearing } = scene(DEMO, DEMO_TIME);
      const rnd = mulberry32(20261021);
      let elevHits = 0;
      let placeHits = 0;
      const trials = 200;
      for (let i = 0; i < trials; i++) {
        const p = (q: Pt): Pt => ({ x: q.x + noise(rnd), y: q.y + noise(rnd) });
        const noisy = { base: p(marks.base), top: p(marks.top), tip: p(marks.tip) };
        const fix = solveShadow({ marks: noisy, timeUtc: DEMO_TIME, shadowBearingDeg: bearing });
        if ("error" in fix) continue;
        if (Math.abs(fix.elevationDeg - sun.elevationDeg) <= fix.uncertaintyDeg) elevHits++;
        const radiusM = Math.round(fix.uncertaintyDeg * 111195);
        const nearest = Math.min(...fix.points.map((q) => angularDistanceDeg(q, DEMO) * 111195));
        if (nearest <= radiusM) placeHits++;
      }
      expect(elevHits / trials).toBeGreaterThanOrEqual(0.9);
      expect(placeHits / trials).toBeGreaterThanOrEqual(0.9);
    });
  }
});
