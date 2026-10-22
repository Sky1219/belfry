import { describe, expect, it } from "vitest";
import {
  angularDistanceDeg,
  destination,
  fixesFromAzimuth,
  initialBearingDeg,
  locus,
  locusAtLatitude,
  normalizeLon,
} from "../../src/tools/shadow/geo";
import { solarPosition, subsolarPoint, type LatLon } from "../../src/tools/shadow/solar";

const inLonRange = (lon: number) => lon > -180 && lon <= 180;

describe("normalizeLon", () => {
  it("folds into (-180, 180]", () => {
    expect(normalizeLon(190)).toBeCloseTo(-170, 9);
    expect(normalizeLon(-190)).toBeCloseTo(170, 9);
    expect(normalizeLon(180)).toBe(180);
    expect(normalizeLon(-180)).toBe(180);
    expect(normalizeLon(540)).toBe(180);
    expect(normalizeLon(0)).toBe(0);
  });
});

describe("angularDistanceDeg and initialBearingDeg", () => {
  it("measures known arcs", () => {
    expect(angularDistanceDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 90 })).toBeCloseTo(90, 9);
    expect(angularDistanceDeg({ lat: 90, lon: 0 }, { lat: -90, lon: 40 })).toBeCloseTo(180, 9);
    expect(angularDistanceDeg({ lat: 10, lon: 20 }, { lat: 10, lon: 20 })).toBe(0);
    expect(angularDistanceDeg({ lat: 0, lon: 179 }, { lat: 0, lon: -179 })).toBeCloseTo(2, 9);
  });

  it("gives compass bearings in [0, 360)", () => {
    const o = { lat: 0, lon: 0 };
    expect(initialBearingDeg(o, { lat: 10, lon: 0 })).toBeCloseTo(0, 9);
    expect(initialBearingDeg(o, { lat: 0, lon: 10 })).toBeCloseTo(90, 9);
    expect(initialBearingDeg(o, { lat: -10, lon: 0 })).toBeCloseTo(180, 9);
    expect(initialBearingDeg(o, { lat: 0, lon: -10 })).toBeCloseTo(270, 9);
  });
});

describe("destination", () => {
  it("wraps across the date line (Review Focus 2)", () => {
    const d = destination({ lat: 0, lon: 179 }, 90, 2);
    expect(d.lat).toBeCloseTo(0, 9);
    expect(d.lon).toBeCloseTo(-179, 9);
    const w = destination({ lat: 0, lon: -179 }, 270, 2);
    expect(w.lon).toBeCloseTo(179, 9);
  });

  it("goes over the pole", () => {
    const d = destination({ lat: 80, lon: 0 }, 0, 20);
    expect(d.lat).toBeCloseTo(80, 9);
    expect(d.lon).toBeCloseTo(180, 9);
  });

  it("is the inverse of distance and bearing", () => {
    const a = { lat: 51.5, lon: -0.12 };
    const b = destination(a, 73, 12.5);
    expect(angularDistanceDeg(a, b)).toBeCloseTo(12.5, 9);
    expect(initialBearingDeg(a, b)).toBeCloseTo(73, 7);
  });
});

describe("locus", () => {
  it("defaults to 360 points, each at the zenith distance from the subsolar point", () => {
    const sub = { lat: 23.4, lon: 150 };
    const pts = locus(sub, 40);
    expect(pts).toHaveLength(360);
    for (const p of pts) {
      expect(Math.abs(angularDistanceDeg(sub, p) - 40)).toBeLessThan(1e-9);
      expect(inLonRange(p.lon)).toBe(true);
    }
  });

  it("stays on the circle and in range over a pole and across the date line", () => {
    const sub = { lat: 23.4, lon: 179.5 };
    const pts = locus(sub, 70, 720);
    expect(pts).toHaveLength(720);
    expect(pts.some((p) => p.lat > 85)).toBe(true);
    for (const p of pts) {
      expect(Number.isFinite(p.lat) && Number.isFinite(p.lon)).toBe(true);
      expect(Math.abs(angularDistanceDeg(sub, p) - 70)).toBeLessThan(1e-9);
      expect(inLonRange(p.lon)).toBe(true);
    }
  });
});

describe("locusAtLatitude", () => {
  const sub = { lat: 23.4, lon: 0 };
  it("is empty where the circle does not reach", () => {
    expect(locusAtLatitude(sub, 30, 80)).toEqual([]);
    expect(locusAtLatitude(sub, 30, -20)).toEqual([]);
  });

  it("gives one longitude at the circle's poleward edge", () => {
    const r = locusAtLatitude(sub, 30, 53.4);
    expect(r).toHaveLength(1);
    expect(r[0]).toBeCloseTo(0, 3);
  });

  it("gives two symmetric longitudes inside the circle's span", () => {
    const r = locusAtLatitude(sub, 30, 40);
    expect(r).toHaveLength(2);
    expect(r[0] + r[1]).toBeCloseTo(0, 9);
    for (const lon of r) {
      expect(inLonRange(lon)).toBe(true);
      expect(angularDistanceDeg(sub, { lat: 40, lon })).toBeCloseTo(30, 7);
    }
  });

  it("wraps longitudes for a circle centred near the date line", () => {
    const s = { lat: 10, lon: 175 };
    const r = locusAtLatitude(s, 20, 10);
    expect(r).toHaveLength(2);
    for (const lon of r) {
      expect(inLonRange(lon)).toBe(true);
      expect(angularDistanceDeg(s, { lat: 10, lon })).toBeCloseTo(20, 7);
    }
    expect(r.some((lon) => lon < 0)).toBe(true);
  });

  it("handles a circle that encloses a pole without NaN", () => {
    // Radius 80 about (60, 0) contains the north pole: latitudes near 90 are inside, never on it.
    expect(locusAtLatitude({ lat: 60, lon: 0 }, 80, 89)).toEqual([]);
    // The circle's southern edge is at latitude 60 - 80 = -20, touched once.
    const r = locusAtLatitude({ lat: 60, lon: 0 }, 80, -20);
    expect(r).toHaveLength(1);
    expect(r[0]).toBeCloseTo(0, 1);
  });

  it("returns nothing, not NaN, when the subsolar point is at a pole", () => {
    const r = locusAtLatitude({ lat: 90, lon: 0 }, 40, 50);
    expect(r.every(Number.isFinite)).toBe(true);
  });
});

describe("pinned solar reference", () => {
  it("London, 2026-06-21T14:00Z: azimuth 230.0, apparent elevation 53.98", () => {
    const p = solarPosition(new Date("2026-06-21T14:00:00Z"), 51.5, -0.12);
    expect(Math.abs(p.azimuthDeg - 230.0)).toBeLessThan(0.3);
    expect(Math.abs(p.elevationDeg - 53.98)).toBeLessThan(0.05);
  });
});

describe("fixesFromAzimuth", () => {
  const observers: [string, LatLon][] = [
    ["London", { lat: 51.5, lon: -0.12 }],
    ["Sydney", { lat: -33.87, lon: 151.21 }],
    ["Nairobi", { lat: -1.29, lon: 36.82 }],
    ["Reykjavik", { lat: 64.15, lon: -21.94 }],
    ["Lima", { lat: -12.05, lon: -77.04 }],
    ["Tokyo", { lat: 35.68, lon: 139.69 }],
  ];

  it("recovers the observer from the sun's height and azimuth", () => {
    let tested = 0;
    let unique = 0;
    for (const [name, obs] of observers) {
      for (const hour of [6, 12, 18]) {
        const when = new Date(Date.UTC(2026, 5, 21, hour));
        const sun = solarPosition(when, obs.lat, obs.lon);
        if (sun.geometricElevationDeg < 10) continue;
        const sub = subsolarPoint(when);
        const zenith = 90 - sun.geometricElevationDeg;
        const label = `${name} ${hour}:00Z`;
        // The observer is always one of the places that fit the photo.
        const fixes = fixesFromAzimuth(sub, zenith, sun.azimuthDeg);
        expect(
          fixes.some((f) => angularDistanceDeg(f, obs) < 0.1),
          label,
        ).toBe(true);
        // Where the photo fits only one place, that place is the observer.
        if (fixes.length === 1) {
          expect(angularDistanceDeg(fixes[0], obs), label).toBeLessThan(0.1);
          unique++;
        }
        tested++;
      }
    }
    expect(tested).toBeGreaterThanOrEqual(8);
    expect(unique).toBeGreaterThanOrEqual(7);
  });

  it("reports both places when a large circle is crossed twice", () => {
    // Reykjavik at 06:00Z: the sun is 12 degrees up, so the circle is wide, and a second
    // place on it sees the sun at the same height and azimuth.
    const when = new Date("2026-06-21T06:00:00Z");
    const sun = solarPosition(when, 64.15, -21.94);
    const sub = subsolarPoint(when);
    const zenith = 90 - sun.geometricElevationDeg;
    const fixes = fixesFromAzimuth(sub, zenith, sun.azimuthDeg);
    expect(fixes).toHaveLength(2);
    for (const f of fixes) {
      expect(Math.abs(angularDistanceDeg(sub, f) - zenith)).toBeLessThan(1e-9);
      const seen = solarPosition(when, f.lat, f.lon);
      expect(Math.abs(seen.geometricElevationDeg - sun.geometricElevationDeg)).toBeLessThan(0.01);
      expect(Math.abs(seen.azimuthDeg - sun.azimuthDeg)).toBeLessThan(0.05);
    }
  });

  it("recovers an observer near the pole, where the circle passes over it", () => {
    const when = new Date("2026-06-21T12:00:00Z");
    const obs = { lat: 89.5, lon: 30 };
    const sun = solarPosition(when, obs.lat, obs.lon);
    const fixes = fixesFromAzimuth(subsolarPoint(when), 90 - sun.geometricElevationDeg, sun.azimuthDeg);
    expect(fixes.some((f) => angularDistanceDeg(f, obs) < 0.1)).toBe(true);
  });

  it("recovers an observer across the date line from the subsolar point", () => {
    const when = new Date("2026-06-21T00:00:00Z");
    const obs = { lat: 20, lon: -170 };
    const sun = solarPosition(when, obs.lat, obs.lon);
    const fixes = fixesFromAzimuth(subsolarPoint(when), 90 - sun.geometricElevationDeg, sun.azimuthDeg);
    expect(fixes).toHaveLength(1);
    expect(inLonRange(fixes[0].lon)).toBe(true);
    expect(angularDistanceDeg(fixes[0], obs)).toBeLessThan(0.1);
  });

  it("returns no place within 2 degrees of the subsolar point, not a wild point", () => {
    const sub = { lat: 20, lon: 40 };
    expect(fixesFromAzimuth(sub, 1.5, 123)).toEqual([]);
    expect(fixesFromAzimuth(sub, 0, 123)).toEqual([]);
    expect(fixesFromAzimuth(sub, 3, 123).length).toBeGreaterThan(0);
  });

  it("normalises the azimuth it is given", () => {
    const sub = { lat: 20, lon: 40 };
    const a = fixesFromAzimuth(sub, 30, 330);
    const b = fixesFromAzimuth(sub, 30, -30);
    const c = fixesFromAzimuth(sub, 30, 690);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toHaveLength(a.length);
    expect(c).toHaveLength(a.length);
    a.forEach((p, i) => {
      expect(angularDistanceDeg(p, b[i])).toBeLessThan(1e-6);
      expect(angularDistanceDeg(p, c[i])).toBeLessThan(1e-6);
    });
  });
});
