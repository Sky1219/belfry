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

  it("falls back to the circle, not a refusal, when the sun stood within 2 degrees of the zenith (Ruling P4-R13)", () => {
    // a 200 px object with a 6 px shadow: the sun was at 88.3 degrees
    const marks = { base: { x: 100, y: 400 }, top: { x: 100, y: 200 }, tip: { x: 106, y: 400 } };
    const fix = solveShadow({ marks, timeUtc: DEMO_TIME, shadowBearingDeg: 120 });
    if ("error" in fix) throw new Error(fix.error);
    // the circle around the subsolar point is itself the fix: the bearing is set aside, and the body says so
    expect(fix.points).toEqual([]);
    expect(fix.radiusM).toBeNull();
    expect(fix.overhead).toBe(true);
    expect(fix.shadowBearingDeg).toBe(120);
    const bare = solveShadow({ marks, timeUtc: DEMO_TIME });
    if ("error" in bare) throw new Error(bare.error);
    expect(bare.overhead).toBe(false);
    expect(fix.zenithDeg).toBe(bare.zenithDeg);
    const f = shadowFinding(fix);
    expect(f.title).toMatch(/^Sun elevation: /);
    expect(f.body).toContain("The sun was almost overhead, so its direction adds nothing; the circle alone places the photo. " + LIMIT);
    expect(shadowFinding(bare).body).not.toContain("almost overhead");
  });

  it("records what it solved from: the marks, the folded bearing, the pixel sigma and the time", () => {
    const { marks } = scene(DEMO, DEMO_TIME);
    const fix = solveShadow({ marks, timeUtc: DEMO_TIME, shadowBearingDeg: -310, pxSigma: 16 });
    if ("error" in fix) throw new Error(fix.error);
    expect(fix.marks).toEqual(marks);
    expect(fix.shadowBearingDeg).toBe(50);
    expect(fix.pxSigma).toBe(16);
    const bare = solveShadow({ marks, timeUtc: DEMO_TIME });
    if ("error" in bare) throw new Error(bare.error);
    expect(bare.shadowBearingDeg).toBeNull();
    expect(bare.pxSigma).toBe(3);
  });

  it("states a place radius that grows when the sun is low and the bearing stretches the error", () => {
    const radius = (obs: LatLon, when: Date) => {
      const { marks, bearing } = scene(obs, when);
      const fix = solveShadow({ marks, timeUtc: when, shadowBearingDeg: bearing });
      if ("error" in fix) throw new Error(fix.error);
      return fix.radiusM!;
    };
    const high = radius(DEMO, DEMO_TIME);
    const low = radius(DEMO, new Date("2026-06-21T16:30:00Z"));
    expect(high).toBeGreaterThan(0);
    expect(low).toBeGreaterThan(high);
    const { marks } = scene(DEMO, DEMO_TIME);
    const bare = solveShadow({ marks, timeUtc: DEMO_TIME });
    if ("error" in bare) throw new Error(bare.error);
    expect(bare.radiusM).toBeNull();
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
    radiusM: null,
    marks: { base: { x: 100, y: 400 }, top: { x: 100, y: 200 }, tip: { x: 254, y: 400 } },
    shadowBearingDeg: null,
    pxSigma: 3,
    overhead: false,
    ...over,
  });
  const ASSUMES = "That radius assumes the bearing is right to within 2° and the time and its UTC offset are right.";

  it("without a bearing reports the sun elevation and its circle", () => {
    const f = shadowFinding(base({}));
    expect(f.title).toBe("Sun elevation: 52.3° ± 2.1°");
    // to 1 dp, as the panel quotes it (Ruling P4-R10)
    expect(f.detail).toEqual({ kind: "measurement", value: 52.31, unit: "° sun elevation", uncertainty: 2.06, decimals: 1 });
    expect(f.meta.sunLocus).toEqual({ subsolarLat: 23.4, subsolarLon: -30, zenithDeg: 37.9, bandDeg: 2.06 });
    expect(f.meta.points).toBeUndefined();
    expect(f.meta.radiusM).toBeUndefined();
    // the solver's inputs travel with the finding (Ruling P4-R13)
    expect(f.meta.inputs).toEqual({
      marks: { base: { x: 100, y: 400 }, top: { x: 100, y: 200 }, tip: { x: 254, y: 400 } },
      shadowBearingDeg: null,
      pxSigma: 3,
      timeUtc: "2026-06-21T14:00:00.000Z",
    });
    expect(f.body).not.toContain("so the sun stood at");
    expect(f.body).toContain("2026-06-21 14:00 UTC");
    expect(f.body).toContain("52.3° ± 2.1°");
    // the band, in km: 2.06 degrees of arc is 229 km
    expect(f.body).toContain("give or take 229 km");
    expect(f.body.endsWith(LIMIT)).toBe(true);
  });

  it("with one place gives a location with a radius from the uncertainty", () => {
    const f = shadowFinding(base({ points: [{ lat: 51.5, lon: -0.12 }], uncertaintyDeg: 1.1, radiusM: 234567, shadowBearingDeg: 50.04 }));
    expect(f.title).toBe("Shadow fix: 51.5° N, 0.1° W");
    // the radius is the solver's propagated one, not the elevation band alone
    expect(f.detail).toEqual({ kind: "location", lat: 51.5, lon: -0.12, radiusM: 234567 });
    expect(f.meta.sunLocus.bandDeg).toBe(1.1);
    expect(f.meta.radiusM).toBe(234567);
    expect(f.meta.inputs.shadowBearingDeg).toBe(50.04);
    expect(f.body).toContain("2026-06-21 14:00 UTC");
    expect(f.body).toContain("within about 235 km");
    // the bearing is echoed with the sun direction it implies, so a sun azimuth typed by mistake shows (Ruling P4-R13)
    expect(f.body).toContain("With the shadow's bearing (shadow 50.0°, so the sun stood at 230.0°) that puts the photo at 51.5° N, 0.1° W");
    // the radius's assumptions come before the limit sentence, which stays last and verbatim (Ruling P4-R12)
    expect(f.body).toContain(ASSUMES + " " + LIMIT);
    expect(f.body).not.toContain("camera clock");
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
    const f = shadowFinding(base({ points: pts, radiusM: 248139, shadowBearingDeg: 359.97 }));
    expect(f.title).toBe("Shadow fix: two possible places");
    expect(f.body).toContain("51.5° N, 0.1° W");
    expect(f.body).toContain("12.3° S, 120.1° E");
    expect(f.body).toMatch(/same height and direction/);
    expect(f.body).toContain("2026-06-21 14:00 UTC");
    // each place carries the radius, and the same assumptions as one place (Ruling P4-R9)
    expect(f.body).toContain("51.5° N, 0.1° W and 12.3° S, 120.1° E, each within about 248 km.");
    expect(f.body).toContain(ASSUMES + " " + LIMIT);
    expect(f.body).not.toContain("too close to tell apart");
    // a bearing that rounds to 360.0 reads as 0.0, and the sun opposite it
    expect(f.body).toContain("(shadow 0.0°, so the sun stood at 180.0°)");
    expect(f.body.endsWith(LIMIT)).toBe(true);
    expect(f.detail).toEqual({ kind: "measurement", value: 52.31, unit: "° sun elevation", uncertainty: 2.06, decimals: 1 });
    expect(f.meta.points).toEqual(pts);
    expect(f.meta.radiusM).toBe(248139);
    expect(f.meta.sunLocus.bandDeg).toBe(2.06);
  });

  it("says two places closer than twice the radius can't be told apart, and how wide the region is", () => {
    // one degree of latitude apart (111 km) with a 150 km radius: the discs overlap
    const pts = [
      { lat: 10, lon: 20 },
      { lat: 11, lon: 20 },
    ];
    const f = shadowFinding(base({ points: pts, radiusM: 150000, shadowBearingDeg: 200 }));
    expect(f.title).toBe("Shadow fix: two possible places");
    // 111 km apart plus 150 km either side
    expect(f.body).toContain("The two places are too close to tell apart; treat them as one region about 411 km across.");
    expect(f.body.endsWith(LIMIT)).toBe(true);
    // just over twice the radius apart, they can
    const apart = shadowFinding(base({ points: pts, radiusM: 55000, shadowBearingDeg: 200 }));
    expect(apart.body).not.toContain("too close to tell apart");
  });

  it("refuses more than two places as a solver error, not a finding", () => {
    const pts = [
      { lat: 10, lon: 20 },
      { lat: 11, lon: 20 },
      { lat: 12, lon: 20 },
    ];
    expect(() => shadowFinding(base({ points: pts, radiusM: 1000 }))).toThrow(/at most two places, got 3/);
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
      expect(f.meta.radiusM).toBe(fix.radiusM);
      expect(f.meta.inputs).toEqual({ marks, shadowBearingDeg: normalizeBearing(bearing), pxSigma: 3, timeUtc: when.toISOString() });
      expect(f.body).toContain(ASSUMES);
    }
  });

  it("states a radius for each of London's two places at 06:00Z", () => {
    const when = new Date("2026-06-21T06:00:00Z");
    const { marks, bearing } = scene(DEMO, when);
    const fix = solveShadow({ marks, timeUtc: when, shadowBearingDeg: bearing });
    if ("error" in fix) throw new Error(fix.error);
    expect(fix.points).toHaveLength(2);
    expect(fix.radiusM!).toBeGreaterThan(0);
    const f = shadowFinding(fix);
    expect(f.body).toContain(`each within about ${Math.round(fix.radiusM! / 1000)} km.`);
    expect(f.body).toContain(ASSUMES + " " + LIMIT);
  });
});

// Rulings P4-R1 and P4-R3: the stated uncertainty and radius must cover the error that real clicks and a
// hand-typed bearing make, in scenes other than the demo.
describe("uncertainty coverage", () => {
  const mulberry32 = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Marks are clicked to within 3 px, uniformly.
  const noise = (rnd: () => number) => (rnd() * 2 - 1) * 3;
  const scenes: [string, LatLon, string][] = [
    ["London 14:00Z (sun 54°)", DEMO, "2026-06-21T14:00:00Z"],
    ["London 16:30Z (sun 32°)", DEMO, "2026-06-21T16:30:00Z"],
    ["Tokyo 07:00Z", { lat: 35.68, lon: 139.69 }, "2026-06-21T07:00:00Z"],
    ["Quito 15:00Z", { lat: -0.18, lon: -78.47 }, "2026-06-21T15:00:00Z"],
  ];

  for (const [sceneName, obs, iso] of scenes) {
    it(`covers the true elevation and place in at least 90% of 200 trials: ${sceneName}, marks ±3 px, bearing ±2°`, () => {
      const when = new Date(iso);
      const { marks, sun, bearing } = scene(obs, when);
      const rnd = mulberry32(20261021);
      let elevHits = 0;
      let placeHits = 0;
      const trials = 200;
      for (let i = 0; i < trials; i++) {
        const p = (q: Pt): Pt => ({ x: q.x + noise(rnd), y: q.y + noise(rnd) });
        const noisy = { base: p(marks.base), top: p(marks.top), tip: p(marks.tip) };
        // a hand-typed bearing is right to within 2 degrees
        const typed = bearing + (rnd() * 2 - 1) * 2;
        const fix = solveShadow({ marks: noisy, timeUtc: when, shadowBearingDeg: typed });
        if ("error" in fix) continue;
        if (Math.abs(fix.elevationDeg - sun.elevationDeg) <= fix.uncertaintyDeg) elevHits++;
        // two places count as covered if the truth is within the radius of the nearer one
        const nearest = Math.min(...fix.points.map((q) => angularDistanceDeg(q, obs) * 111195));
        if (nearest <= fix.radiusM!) placeHits++;
      }
      expect(elevHits / trials).toBeGreaterThanOrEqual(0.9);
      expect(placeHits / trials).toBeGreaterThanOrEqual(0.9);
    }, 60000);
  }
});

// Ruling P4-R8: the marks assume the shadow lies in the picture's plane. A shadow pointing towards or
// away from the camera is foreshortened, reads as a higher sun, and moves the fix far outside the
// stated radius, which knows only about the marks and the bearing. This pins why the view says so.
describe("a foreshortened shadow (pinhole camera)", () => {
  const RAD = Math.PI / 180;
  // A 12 MP photo (4032 x 3024, focal length 3000 px) from a camera 1.6 m up, 10 m from a 5 m
  // lamp post, looking level. World: x to the right, y away from the camera, z up.
  const project = ([x, y, z]: [number, number, number]): Pt => {
    const forward = y + 10;
    return { x: 2016 + (3000 * x) / forward, y: 1512 - (3000 * (z - 1.6)) / forward };
  };
  const sun = solarPosition(DEMO_TIME, DEMO.lat, DEMO.lon);
  const shadowM = 5 / Math.tan(sun.elevationDeg * RAD);
  // shown 760 px wide, as the view passes it: 3 screen pixels
  const pxSigma = (3 * 4032) / 760;

  /** The fix for a shadow turned offPlaneDeg out of the picture's plane: how far off it is, and the radius it states. */
  const solveAt = (offPlaneDeg: number) => {
    const a = offPlaneDeg * RAD;
    const marks = {
      base: project([0, 0, 0]),
      top: project([0, 0, 5]),
      tip: project([shadowM * Math.cos(a), shadowM * Math.sin(a), 0]),
    };
    const fix = solveShadow({ marks, timeUtc: DEMO_TIME, shadowBearingDeg: sun.azimuthDeg + 180, pxSigma });
    if ("error" in fix) throw new Error(fix.error);
    expect(fix.points).toHaveLength(1);
    return { offM: angularDistanceDeg(fix.points[0], DEMO) * 111195, radiusM: fix.radiusM! };
  };

  it("fixes the place within the stated radius when the shadow runs square to the camera", () => {
    const { offM, radiusM } = solveAt(0);
    expect(offM).toBeLessThan(radiusM);
    expect(offM).toBeLessThan(5000);
  });

  it("errs by more than the stated radius when the shadow points 45 degrees away from the camera, or 70 towards it", () => {
    // Towards the camera the tip also drops lower in the frame, which partly offsets the foreshortening
    // at moderate angles (measured: 244 km off at -20 degrees, 121 km at -45, 1584 km at -70).
    for (const deg of [45, -70]) {
      const { offM, radiusM } = solveAt(deg);
      expect(offM, `${deg} degrees`).toBeGreaterThan(radiusM);
      // hundreds of km, as the view's how-to line says
      expect(offM, `${deg} degrees`).toBeGreaterThan(500000);
    }
  });
});
