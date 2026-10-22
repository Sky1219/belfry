import { describe, expect, it } from "vitest";
import { DEMO_TRUTH, readShadowDemo, shadowDemoPixels, shadowDemoScene } from "../../src/tools/shadow/demo";
import {
  MSG_BEARING_FORMAT,
  MSG_OFFSET,
  MSG_OFFSET_FORMAT,
  bearingFromField,
  fieldsFromMetadata,
  fieldsFromUtc,
  formatOffset,
  readOffset,
  timeFromFields,
} from "../../src/tools/shadow/fields";
import { angularDistanceDeg, locus } from "../../src/tools/shadow/geo";
import { TABLE_LATITUDES, drawGraticule, latitudeTable, splitAtAntimeridian } from "../../src/tools/shadow/graticule";
import { nudgeStep } from "../../src/tools/shadow/Marks";
import { shadowFinding, solveShadow } from "../../src/tools/shadow/shadow";
import { solarPosition, subsolarPoint, type LatLon } from "../../src/tools/shadow/solar";

/** The largest longitude step between neighbours in a run: a streak across the map shows up as one near 360. */
const widestStep = (run: Array<{ lon: number }>) => Math.max(0, ...run.slice(1).map((p, i) => Math.abs(p.lon - run[i].lon)));

describe("splitAtAntimeridian", () => {
  it("leaves a ring that never crosses the date line in one closed run", () => {
    const ring = locus({ lat: 20, lon: 0 }, 30, 72);
    const runs = splitAtAntimeridian(ring);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(73);
    expect(runs[0][72]).toEqual(runs[0][0]);
  });

  it("cuts a ring that crosses the date line into runs that end on the edges", () => {
    // centred near the date line, so the circle crosses it twice
    const ring = locus({ lat: 10, lon: 175 }, 30, 360);
    const runs = splitAtAntimeridian(ring);
    expect(runs).toHaveLength(2);
    for (const run of runs) {
      expect(widestStep(run)).toBeLessThan(10);
      expect(Math.abs(run[0].lon)).toBe(180);
      expect(Math.abs(run[run.length - 1].lon)).toBe(180);
    }
    // each cut ends one run and starts the other at the same latitude, on opposite edges
    const [a, b] = runs;
    expect(a[a.length - 1].lat).toBeCloseTo(b[0].lat, 9);
    expect(a[a.length - 1].lon).toBe(-b[0].lon);
    expect(b[b.length - 1].lat).toBeCloseTo(a[0].lat, 9);
  });

  it("interpolates the crossing latitude between the points either side", () => {
    const runs = splitAtAntimeridian(
      [
        { lat: 0, lon: 170 },
        { lat: 10, lon: -170 },
      ],
      false,
    );
    expect(runs).toEqual([
      [
        { lat: 0, lon: 170 },
        { lat: 5, lon: 180 },
      ],
      [
        { lat: 5, lon: -180 },
        { lat: 10, lon: -170 },
      ],
    ]);
  });

  it("draws a circle round a pole as one run from edge to edge", () => {
    // the sun high over the Arctic summer: the circle encloses the North Pole and crosses the date line once
    const ring = locus({ lat: 23.4, lon: -30 }, 80, 360);
    const runs = splitAtAntimeridian(ring);
    expect(runs).toHaveLength(1);
    expect(widestStep(runs[0])).toBeLessThan(10);
    expect(Math.abs(runs[0][0].lon)).toBe(180);
    expect(Math.abs(runs[0][runs[0].length - 1].lon)).toBe(180);
  });

  it("handles empty input", () => {
    expect(splitAtAntimeridian([])).toEqual([]);
  });
});

describe("latitudeTable", () => {
  it("lists 75 N to 75 S, with two longitudes where the circle crosses and none where it doesn't reach", () => {
    const rows = latitudeTable({ subsolar: { lat: 23.4, lon: -30 }, zenithDeg: 36 });
    expect(rows.map((r) => r.lat)).toEqual(TABLE_LATITUDES);
    expect(rows.map((r) => r.lat)).toEqual([75, 60, 45, 30, 15, 0, -15, -30, -45, -60, -75]);
    const at = (lat: number) => rows.find((r) => r.lat === lat)!.lons;
    // a 36 degree circle about 23.4 N reaches from 12.6 S to 59.4 N
    expect(at(75)).toEqual([]);
    expect(at(60)).toEqual([]);
    expect(at(-15)).toEqual([]);
    expect(at(45)).toHaveLength(2);
    expect(at(45)[0]).toBeLessThan(at(45)[1]);
    for (const lon of at(0)) expect(lon > -180 && lon <= 180).toBe(true);
  });
});

describe("readOffset", () => {
  it("reads offsets as people type them", () => {
    expect(readOffset("+01:00")).toBe(60);
    expect(readOffset("+0100")).toBe(60);
    expect(readOffset("+1")).toBe(60);
    expect(readOffset("1")).toBe(60);
    expect(readOffset("-5:30")).toBe(-330);
    expect(readOffset("−05:00")).toBe(-300);
    expect(readOffset("+0")).toBe(0);
    expect(readOffset("UTC+2")).toBe(120);
    expect(readOffset(" +05:45 ")).toBe(345);
  });

  it("refuses what isn't an offset, an empty field included", () => {
    for (const s of ["", " ", "abc", "+15", "+01:60", "+1:5", "++1", "1.5"]) expect(readOffset(s)).toBeNull();
  });

  it("round-trips through formatOffset", () => {
    for (const m of [-720, -330, 0, 60, 345, 840]) expect(readOffset(formatOffset(m))).toBe(m);
    expect(formatOffset(0)).toBe("+00:00");
    expect(formatOffset(-330)).toBe("-05:30");
  });
});

describe("timeFromFields", () => {
  it("reads a local clock time and its offset as one instant", () => {
    const r = timeFromFields({ date: "2026-06-21", time: "15:00", offset: "+01:00" });
    expect(r).toEqual({ timeUtc: new Date("2026-06-21T14:00:00Z") });
    expect(timeFromFields({ date: "2026-06-21", time: "09:30:15", offset: "-5:30" })).toEqual({
      timeUtc: new Date("2026-06-21T15:00:15Z"),
    });
  });

  it("asks for the offset rather than guessing one (Review Focus 1)", () => {
    expect(timeFromFields({ date: "2026-06-21", time: "15:00", offset: "" })).toEqual({ error: MSG_OFFSET });
    expect(MSG_OFFSET).toBe("Enter the UTC offset the photo was taken in: the same clock time is a different sun in every zone.");
    expect(timeFromFields({ date: "2026-06-21", time: "15:00", offset: "east" })).toEqual({ error: MSG_OFFSET_FORMAT });
  });

  it("asks for the date and time when either is missing or not a real one", () => {
    const msg = { error: "Enter the date and time the photo was taken." };
    expect(timeFromFields({ date: "", time: "15:00", offset: "+01:00" })).toEqual(msg);
    expect(timeFromFields({ date: "2026-06-21", time: "", offset: "+01:00" })).toEqual(msg);
    expect(timeFromFields({ date: "2026-02-30", time: "15:00", offset: "+01:00" })).toEqual(msg);
    expect(timeFromFields({ date: "2026-06-21", time: "25:00", offset: "+01:00" })).toEqual(msg);
  });
});

describe("bearingFromField", () => {
  it("is optional, takes any finite number and leaves the folding to the solver", () => {
    expect(bearingFromField("")).toEqual({});
    expect(bearingFromField("  ")).toEqual({});
    expect(bearingFromField("50.3")).toEqual({ bearingDeg: 50.3 });
    expect(bearingFromField("-30")).toEqual({ bearingDeg: -30 });
    expect(bearingFromField("−30°")).toEqual({ bearingDeg: -30 });
    expect(bearingFromField("390")).toEqual({ bearingDeg: 390 });
    expect(bearingFromField("north")).toEqual({ error: MSG_BEARING_FORMAT });
  });
});

describe("fields from the photo or the demo", () => {
  it("fills the local time and offset from EXIF when both are there", () => {
    const r = fieldsFromMetadata({ dateTimeOriginal: "2026:06:21 15:00:00", offsetTimeOriginal: "+01:00" });
    expect(r).toEqual({ fields: { date: "2026-06-21", time: "15:00:00", offset: "+01:00" }, source: "exif" });
    expect(timeFromFields(r.fields)).toEqual({ timeUtc: new Date("2026-06-21T14:00:00Z") });
  });

  it("fills the clock reading and leaves the offset empty when the camera recorded none (most cameras)", () => {
    const r = fieldsFromMetadata({ dateTimeOriginal: "2026:06:21 15:00:00" });
    expect(r).toEqual({ fields: { date: "2026-06-21", time: "15:00:00", offset: "" }, source: "exif-no-offset" });
    expect(timeFromFields(r.fields)).toEqual({ error: MSG_OFFSET });
  });

  it("fills nothing without a readable EXIF time", () => {
    expect(fieldsFromMetadata({})).toEqual({ fields: { date: "", time: "", offset: "" }, source: "none" });
    expect(fieldsFromMetadata({ dateTimeOriginal: "yesterday" }).source).toBe("none");
  });

  it("shows an instant in UTC, or as the clock read it at an offset", () => {
    const t = new Date("2026-06-21T14:00:00Z");
    expect(fieldsFromUtc(t)).toEqual({ date: "2026-06-21", time: "14:00:00", offset: "+00:00" });
    // London in summer: the same instant, an hour later on the clock (Ruling P4-R12)
    const bst = fieldsFromUtc(t, "+01:00");
    expect(bst).toEqual({ date: "2026-06-21", time: "15:00:00", offset: "+01:00" });
    expect(timeFromFields(bst)).toEqual({ timeUtc: t });
    // across midnight, and west of UTC
    expect(fieldsFromUtc(new Date("2026-06-22T03:00:00Z"), "-05:00")).toEqual({ date: "2026-06-21", time: "22:00:00", offset: "-05:00" });
  });
});

describe("the demo shadow", () => {
  it("solves to one place near the demo truth, and the finding quotes it as the e2e expects", () => {
    const scene = shadowDemoScene();
    // staged as a London summer clock: 15:00 at +01:00, the demo truth's 14:00Z (Ruling P4-R12)
    expect(scene.utcOffset).toBe("+01:00");
    const fields = fieldsFromUtc(new Date(scene.timeUtc), scene.utcOffset);
    expect(fields).toEqual({ date: "2026-06-21", time: "15:00:00", offset: "+01:00" });
    const time = timeFromFields(fields);
    if ("error" in time) throw new Error(time.error);
    const fix = solveShadow({ marks: scene.marks, timeUtc: time.timeUtc, shadowBearingDeg: scene.bearingDeg });
    if ("error" in fix) throw new Error(fix.error);
    expect(fix.points).toHaveLength(1);
    expect(angularDistanceDeg(fix.points[0], DEMO_TRUTH)).toBeLessThan(0.3);
    expect(fix.subsolar).toEqual(subsolarPoint(new Date(DEMO_TRUTH.timeUtc)));
    const f = shadowFinding(fix);
    expect(f.title).toMatch(/^Shadow fix: 5[01]\.\d° N, 0\.\d° W$/);
    expect(f.detail.kind).toBe("location");
  });

  it("draws a dark post and a shadow where the marks sit", () => {
    const scene = shadowDemoScene();
    const p = shadowDemoPixels(scene);
    expect([p.width, p.height]).toEqual([640, 480]);
    const luma = (x: number, y: number) => {
      const i = (Math.round(y) * p.width + Math.round(x)) * 4;
      return 0.299 * p.data[i] + 0.587 * p.data[i + 1] + 0.114 * p.data[i + 2];
    };
    const { base, top, tip } = scene.marks;
    const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    // the post is dark against the sky; the shadow darker than the paving beside it
    expect(luma(mid(base, top).x, mid(base, top).y)).toBeLessThan(70);
    const s = mid(base, tip);
    expect(luma(s.x, s.y)).toBeLessThan(luma(s.x, s.y + 20) - 40);
    // and the paving past the tip is no longer in shadow
    expect(luma(tip.x + 25, tip.y)).toBeGreaterThan(luma(s.x, s.y) + 40);
    expect(Math.hypot(top.x - base.x, top.y - base.y)).toBe(200);
    // the shadow runs straight across the picture, square to the camera, as the how-to asks (Ruling P4-R8)
    expect(tip.y).toBe(base.y);
    expect(tip.x).toBeGreaterThan(base.x + 100);
  });

  it("reads the staged demo back from an exhibit's meta, and refuses a malformed one", () => {
    const scene = shadowDemoScene();
    expect(readShadowDemo({ shadowDemo: scene, staged: true })).toEqual(scene);
    expect(readShadowDemo({})).toBeNull();
    expect(readShadowDemo(undefined)).toBeNull();
    expect(readShadowDemo({ shadowDemo: { ...scene, bearingDeg: "50" } })).toBeNull();
    expect(readShadowDemo({ shadowDemo: { ...scene, timeUtc: "soon" } })).toBeNull();
    expect(readShadowDemo({ shadowDemo: { ...scene, utcOffset: "teatime" } })).toBeNull();
    // a demo staged before the offset was (an older exhibit) reads in UTC, as it was shown then
    const { utcOffset: _dropped, ...older } = scene;
    expect(readShadowDemo({ shadowDemo: older })).toEqual({ ...scene, utcOffset: "+00:00" });
    expect(readShadowDemo({ shadowDemo: { ...scene, marks: { ...scene.marks, tip: { x: Number.NaN, y: 3 } } } })).toBeNull();
  });
});

/** What a camera at `obs` would see at `when`: a 200 px upright object, its shadow, and the shadow's bearing. */
function scene(obs: LatLon, when: Date) {
  const sun = solarPosition(when, obs.lat, obs.lon);
  const shadowPx = 200 / Math.tan((sun.elevationDeg * Math.PI) / 180);
  const marks = { base: { x: 100, y: 400 }, top: { x: 100, y: 200 }, tip: { x: 100 + shadowPx, y: 400 } };
  return { marks, bearing: sun.azimuthDeg + 180 };
}

describe("mark uncertainty in screen pixels (Ruling P4-R6)", () => {
  it("states a wider elevation band and place radius for a larger pxSigma", () => {
    const when = new Date(DEMO_TRUTH.timeUtc);
    const { marks, bearing } = scene(DEMO_TRUTH, when);
    const fine = solveShadow({ marks, timeUtc: when, shadowBearingDeg: bearing });
    const coarse = solveShadow({ marks, timeUtc: when, shadowBearingDeg: bearing, pxSigma: 16 });
    const same = solveShadow({ marks, timeUtc: when, shadowBearingDeg: bearing, pxSigma: 3 });
    if ("error" in fine || "error" in coarse || "error" in same) throw new Error("unexpected error");
    expect(coarse.uncertaintyDeg).toBeGreaterThan(fine.uncertaintyDeg * 4);
    expect(coarse.radiusM!).toBeGreaterThan(fine.radiusM!);
    // the default is 3 photo pixels, and the elevation itself doesn't move
    expect(same.uncertaintyDeg).toBe(fine.uncertaintyDeg);
    expect(coarse.elevationDeg).toBe(fine.elevationDeg);
    expect(coarse.points).toHaveLength(1);
  });

  it("falls back to 3 px for a pxSigma that isn't a positive number", () => {
    const when = new Date(DEMO_TRUTH.timeUtc);
    const { marks } = scene(DEMO_TRUTH, when);
    const base = solveShadow({ marks, timeUtc: when });
    if ("error" in base) throw new Error(base.error);
    for (const pxSigma of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = solveShadow({ marks, timeUtc: when, pxSigma });
      if ("error" in r) throw new Error(r.error);
      expect(r.uncertaintyDeg).toBe(base.uncertaintyDeg);
    }
  });
});

describe("arrow-key nudges in screen pixels (Ruling P4-R13)", () => {
  it("moves a mark 1 screen pixel, or 10 with Shift, in photo pixels", () => {
    // a 4032 px photo shown 760 px wide: one screen pixel is about 5.3 photo pixels
    expect(nudgeStep(4032, 760, false)).toBeCloseTo(4032 / 760, 9);
    expect(nudgeStep(4032, 760, true)).toBeCloseTo((10 * 4032) / 760, 9);
    // shown at its own size, a pixel is a pixel
    expect(nudgeStep(640, 640, false)).toBe(1);
  });

  it("never moves less than a photo pixel, and falls back to 1 before the photo is measured", () => {
    // a small photo shown enlarged: half a photo pixel would leave the mark's announced position unchanged
    expect(nudgeStep(320, 640, false)).toBe(1);
    expect(nudgeStep(320, 640, true)).toBe(10);
    for (const shown of [0, Number.NaN, -5]) expect(nudgeStep(4032, shown, false)).toBe(1);
  });
});

type Call = { name: string; args: number[]; fillStyle: unknown; globalAlpha: number };

/** A 2D context that records every call with the fill style and alpha in force, save and restore included. */
function recordingContext() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { fillStyle: "#000000", strokeStyle: "#000000", globalAlpha: 1, lineWidth: 1 };
  const stack: Array<Record<string, unknown>> = [];
  const g = new Proxy(state, {
    get(t, k: string) {
      if (k in t) return t[k];
      return (...args: number[]) => {
        if (k === "save") stack.push({ ...t });
        if (k === "restore") Object.assign(t, stack.pop());
        calls.push({ name: k, args, fillStyle: t.fillStyle, globalAlpha: t.globalAlpha as number });
      };
    },
    set(t, k: string, v) {
      t[k] = v;
      return true;
    },
  });
  return { g: g as unknown as CanvasRenderingContext2D, calls };
}

describe("drawGraticule", () => {
  const W = 760;
  const H = 380;
  const squares = (calls: Call[]) => calls.filter((c) => c.name === "fillRect" && c.fillStyle === "#ffa733" && c.globalAlpha === 1);
  const centre = (c: Call) => ({ x: c.args[0] + c.args[2] / 2, y: c.args[1] + c.args[3] / 2 });
  const at = (p: LatLon) => ({ x: ((p.lon + 180) / 360) * W, y: ((90 - p.lat) / 180) * H });

  it("draws both places for a two-place fix (Ruling P4-R2), each as an amber square where it lies", () => {
    const when = new Date("2026-06-21T06:00:00Z");
    const { marks, bearing } = scene(DEMO_TRUTH, when);
    const fix = solveShadow({ marks, timeUtc: when, shadowBearingDeg: bearing });
    if ("error" in fix) throw new Error(fix.error);
    expect(fix.points).toHaveLength(2);
    const { g, calls } = recordingContext();
    drawGraticule(g, W, H, fix);
    const drawn = squares(calls);
    expect(drawn).toHaveLength(2);
    fix.points.forEach((p, i) => {
      expect(centre(drawn[i]).x).toBeCloseTo(at(p).x, 6);
      expect(centre(drawn[i]).y).toBeCloseTo(at(p).y, 6);
    });
    // the band is amber too, but only at 15%
    expect(calls.some((c) => c.name === "fillRect" && c.fillStyle === "#ffa733" && c.globalAlpha === 0.15)).toBe(true);
  });

  it("draws one square for one place and none for the circle alone", () => {
    const when = new Date(DEMO_TRUTH.timeUtc);
    const { marks, bearing } = scene(DEMO_TRUTH, when);
    for (const [shadowBearingDeg, n] of [
      [bearing, 1],
      [undefined, 0],
    ] as const) {
      const fix = solveShadow({ marks, timeUtc: when, shadowBearingDeg });
      if ("error" in fix) throw new Error(fix.error);
      const { g, calls } = recordingContext();
      drawGraticule(g, W, H, fix);
      expect(squares(calls)).toHaveLength(n);
    }
  });
});
