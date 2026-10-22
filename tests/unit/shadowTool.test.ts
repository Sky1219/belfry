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
import { TABLE_LATITUDES, latitudeTable, splitAtAntimeridian } from "../../src/tools/shadow/graticule";
import { shadowFinding, solveShadow } from "../../src/tools/shadow/shadow";
import { subsolarPoint } from "../../src/tools/shadow/solar";

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

  it("shows the demo's instant in UTC", () => {
    expect(fieldsFromUtc(new Date("2026-06-21T14:00:00Z"))).toEqual({ date: "2026-06-21", time: "14:00:00", offset: "+00:00" });
  });
});

describe("the demo shadow", () => {
  it("solves to one place near the demo truth, and the finding quotes it as the e2e expects", () => {
    const scene = shadowDemoScene();
    const fields = fieldsFromUtc(new Date(scene.timeUtc));
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
  });

  it("reads the staged demo back from an exhibit's meta, and refuses a malformed one", () => {
    const scene = shadowDemoScene();
    expect(readShadowDemo({ shadowDemo: scene, staged: true })).toEqual(scene);
    expect(readShadowDemo({})).toBeNull();
    expect(readShadowDemo(undefined)).toBeNull();
    expect(readShadowDemo({ shadowDemo: { ...scene, bearingDeg: "50" } })).toBeNull();
    expect(readShadowDemo({ shadowDemo: { ...scene, timeUtc: "soon" } })).toBeNull();
    expect(readShadowDemo({ shadowDemo: { ...scene, marks: { ...scene.marks, tip: { x: Number.NaN, y: 3 } } } })).toBeNull();
  });
});
