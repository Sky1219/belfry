import { describe, expect, test } from "vitest";
import {
  apparentToGeometric,
  refractionDeg,
  solarPosition,
  subsolarPoint,
} from "../../src/tools/shadow/solar";

/** Smallest signed angle between two bearings, in degrees. */
const angleDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

/** The minute in [from, to] (ms) at which the sun is highest at this place. */
function noonMinute(from: number, to: number, lat: number, lon: number): Date {
  let best = new Date(from);
  let bestElev = -Infinity;
  for (let t = from; t <= to; t += 60000) {
    const e = solarPosition(new Date(t), lat, lon).geometricElevationDeg;
    if (e > bestElev) {
      bestElev = e;
      best = new Date(t);
    }
  }
  return best;
}

describe("solar declination and equation of time", () => {
  test("declination at the solstices and an equinox", () => {
    expect(Math.abs(solarPosition(new Date("2026-06-21T12:00:00Z"), 0, 0).declinationDeg - 23.43)).toBeLessThan(0.05);
    expect(Math.abs(solarPosition(new Date("2026-12-21T12:00:00Z"), 0, 0).declinationDeg + 23.43)).toBeLessThan(0.05);
    expect(Math.abs(solarPosition(new Date("2026-03-20T12:00:00Z"), 0, 0).declinationDeg)).toBeLessThan(0.5);
  });

  test("equation of time at its February minimum and November maximum", () => {
    const feb = solarPosition(new Date("2026-02-13T12:00:00Z"), 0, 0).eqTimeMin;
    const nov = solarPosition(new Date("2026-11-03T12:00:00Z"), 0, 0).eqTimeMin;
    expect(Math.abs(feb + 14.2)).toBeLessThan(0.4);
    expect(Math.abs(nov - 16.4)).toBeLessThan(0.4);
  });
});

describe("subsolar point", () => {
  test("the sun is overhead there", () => {
    for (const iso of ["2026-03-05T03:17:00Z", "2026-06-21T14:00:00Z", "2026-11-30T21:45:30Z"]) {
      const d = new Date(iso);
      const p = subsolarPoint(d);
      expect(solarPosition(d, p.lat, p.lon).geometricElevationDeg).toBeGreaterThan(89.9);
    }
  });

  test("longitudes stay in (-180, 180] across the day, including at the date line", () => {
    for (let h = 0; h < 24; h += 0.25) {
      const d = new Date(Date.UTC(2026, 8, 3) + h * 3600000);
      const { lon } = subsolarPoint(d);
      expect(lon).toBeGreaterThan(-180);
      expect(lon).toBeLessThanOrEqual(180);
    }
    // 12:00 UTC is Greenwich noon: the subsolar longitude is the equation of time, near 0.
    expect(Math.abs(subsolarPoint(new Date("2026-06-21T12:00:00Z")).lon)).toBeLessThan(2);
    // 00:00 UTC puts the sun near the antimeridian.
    expect(Math.abs(subsolarPoint(new Date("2026-06-21T00:00:00Z")).lon)).toBeGreaterThan(177);
  });
});

describe("solar position on the ground", () => {
  test("London at solar noon on the June solstice: due south, 90 - lat + declination", () => {
    const noon = noonMinute(Date.parse("2026-06-21T11:30:00Z"), Date.parse("2026-06-21T12:30:00Z"), 51.5, 0);
    const p = solarPosition(noon, 51.5, 0);
    expect(Math.abs(p.azimuthDeg - 180)).toBeLessThan(1);
    expect(Math.abs(p.geometricElevationDeg - (90 - 51.5 + p.declinationDeg))).toBeLessThan(0.2);
  });

  test("Sydney at solar noon in June: due north, 90 - |lat| - 23.4", () => {
    const noon = noonMinute(Date.parse("2026-06-21T01:00:00Z"), Date.parse("2026-06-21T02:30:00Z"), -33.87, 151.21);
    const p = solarPosition(noon, -33.87, 151.21);
    expect(Math.abs(angleDiff(p.azimuthDeg, 0))).toBeLessThan(1);
    expect(Math.abs(p.geometricElevationDeg - (90 - 33.87 - 23.43))).toBeLessThan(0.2);
  });

  test("morning sun is in the east, afternoon sun in the west", () => {
    const am = solarPosition(new Date("2026-09-10T08:00:00Z"), 48.85, 2.35);
    const pm = solarPosition(new Date("2026-09-10T15:00:00Z"), 48.85, 2.35);
    expect(am.azimuthDeg).toBeGreaterThan(60);
    expect(am.azimuthDeg).toBeLessThan(150);
    expect(pm.azimuthDeg).toBeGreaterThan(210);
    expect(pm.azimuthDeg).toBeLessThan(300);
  });

  test("midnight sun at Tromso: positive finite elevation, azimuth roughly north", () => {
    const p = solarPosition(new Date("2026-06-21T23:00:00Z"), 69.65, 18.96);
    expect(Number.isFinite(p.elevationDeg)).toBe(true);
    expect(p.elevationDeg).toBeGreaterThan(0);
    expect(Math.abs(angleDiff(p.azimuthDeg, 0))).toBeLessThan(20);
  });

  test("apparent elevation lifts the sun by refraction near the horizon", () => {
    // Sun a few degrees up on a long June evening.
    const p = solarPosition(new Date("2026-06-21T19:30:00Z"), 51.5, 0);
    expect(p.geometricElevationDeg).toBeGreaterThan(-1);
    expect(p.geometricElevationDeg).toBeLessThan(6);
    expect(p.elevationDeg).toBeGreaterThan(p.geometricElevationDeg);
  });

  test("azimuth is in [0, 360) and nothing is NaN at the poles, overhead and across the globe", () => {
    const dates = ["2026-03-20T12:00:00Z", "2026-06-21T00:00:00Z", "2026-12-21T18:30:00Z"].map((s) => new Date(s));
    const lats = [-90, -89.999, -60, 0, 51.5, 89.999, 90];
    const lons = [-180, -90, 0, 90, 180];
    for (const d of dates) {
      for (const lat of lats) {
        for (const lon of lons) {
          const p = solarPosition(d, lat, lon);
          for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
          expect(p.azimuthDeg).toBeGreaterThanOrEqual(0);
          expect(p.azimuthDeg).toBeLessThan(360);
        }
      }
    }
    // Standing at the subsolar point: the sun is overhead and the azimuth is defined.
    const d = new Date("2026-06-21T14:00:00Z");
    const s = subsolarPoint(d);
    const p = solarPosition(d, s.lat, s.lon);
    expect(Number.isFinite(p.azimuthDeg)).toBe(true);
    expect(p.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(p.azimuthDeg).toBeLessThan(360);
  });
});

describe("refraction", () => {
  test("is zero overhead, about 0.1 degree at 10 degrees, about half a degree at the horizon", () => {
    expect(refractionDeg(89)).toBe(0);
    expect(refractionDeg(10)).toBeGreaterThan(0.08);
    expect(refractionDeg(10)).toBeLessThan(0.1);
    expect(refractionDeg(0)).toBeGreaterThan(0.4);
    expect(refractionDeg(0)).toBeLessThan(0.6);
  });

  test("apparentToGeometric inverts the correction", () => {
    for (const e of [5, 10, 30, 60]) {
      expect(Math.abs(apparentToGeometric(e + refractionDeg(e)) - e)).toBeLessThan(1e-6);
    }
  });

  test("apparentToGeometric inverts it just either side of the 5 degree seam and at the horizon", () => {
    for (const e of [4.9, 5.1, 2, 0.5, 0]) {
      expect(Math.abs(apparentToGeometric(e + refractionDeg(e)) - e)).toBeLessThan(1e-4);
    }
  });
});
