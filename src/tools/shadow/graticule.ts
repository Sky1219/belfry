/** The circle of places on a world graticule, and the same circle listed by latitude. */

import { locus, locusAtLatitude } from "./geo";
import type { ShadowFix } from "./shadow";
import type { LatLon } from "./solar";

// mirrored from the theme for the canvas drawing
const AMBER = "#ffa733";
const BONE = "#ece6dc";
const STEEL = "#9aa3ad";
const GLASS = "#07090c";
const LINE = "rgba(236, 230, 220, 0.14)";
const LINE_STRONG = "rgba(236, 230, 220, 0.34)";
/** The band's shading over the glass. */
const BAND_ALPHA = 0.15;
/** Width of the map, in canvas pixels, at which one unit of line work is one pixel (the panel's width). */
const UNIT_WIDTH = 380;
const RAD = Math.PI / 180;

/** Latitudes the listing reads the circle at, north to south as the map has them. */
export const TABLE_LATITUDES = [75, 60, 45, 30, 15, 0, -15, -30, -45, -60, -75];

/** Equirectangular: longitude -180 at the left edge, latitude 90 at the top. */
const toX = (lon: number, w: number) => ((lon + 180) / 360) * w;
const toY = (lat: number, h: number) => ((90 - lat) / 180) * h;

/**
 * A ring of places cut where it crosses the antimeridian, so a map draws it as separate runs
 * instead of a streak across the whole width. Each cut ends one run on the edge and starts the
 * next on the opposite edge at the latitude interpolated between the two points either side.
 * `closed` joins the last point back to the first (a circle); the run that the array's start
 * merely interrupts is stitched back together.
 */
export function splitAtAntimeridian(points: LatLon[], closed = true): LatLon[][] {
  if (points.length === 0) return [];
  const ring = closed ? [...points, points[0]] : points;
  const runs: LatLon[][] = [[ring[0]]];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    const jump = b.lon - a.lon;
    if (Math.abs(jump) > 180) {
      // the short way round crosses the edge on a's side
      const edge = a.lon > 0 ? 180 : -180;
      const bLon = b.lon + (jump > 0 ? -360 : 360);
      const t = (edge - a.lon) / (bLon - a.lon);
      const lat = a.lat + t * (b.lat - a.lat);
      runs[runs.length - 1].push({ lat, lon: edge });
      runs.push([{ lat, lon: -edge }]);
    }
    runs[runs.length - 1].push(b);
  }
  if (closed && runs.length > 1) {
    // the array's start is not a real break: the last run carries on into the first
    const last = runs.pop()!;
    runs[0] = [...last, ...runs[0].slice(1)];
  }
  return runs;
}

/** The circle's longitudes at each listed latitude: none where it doesn't reach, one where it grazes, else two. */
export function latitudeTable(fix: Pick<ShadowFix, "subsolar" | "zenithDeg">): Array<{ lat: number; lons: number[] }> {
  return TABLE_LATITUDES.map((lat) => ({
    lat,
    lons: [...locusAtLatitude(fix.subsolar, fix.zenithDeg, lat)].sort((a, b) => a - b),
  }));
}

/**
 * The band: every place within the uncertainty of the circle, worked out on the sphere cell by cell
 * (so it stays right over the poles and across the date line), filled as runs along each row.
 */
function drawBand(g: CanvasRenderingContext2D, w: number, h: number, fix: ShadowFix) {
  const cell = Math.max(2, Math.round(w / 240));
  const { lat: sLat, lon: sLon } = fix.subsolar;
  const sinS = Math.sin(sLat * RAD);
  const cosS = Math.cos(sLat * RAD);
  const inner = Math.cos(Math.min(180, fix.zenithDeg + fix.uncertaintyDeg) * RAD);
  const outer = Math.cos(Math.max(0, fix.zenithDeg - fix.uncertaintyDeg) * RAD);
  g.save();
  g.globalAlpha = BAND_ALPHA;
  g.fillStyle = AMBER;
  for (let y = 0; y < h; y += cell) {
    const lat = 90 - ((y + cell / 2) / h) * 180;
    const a = Math.sin(lat * RAD) * sinS;
    const b = Math.cos(lat * RAD) * cosS;
    let start = -1;
    for (let x = 0; x <= w; x += cell) {
      let inside = false;
      if (x < w) {
        const lon = ((x + cell / 2) / w) * 360 - 180;
        // the cosine of the arc to the subsolar point, between the band's two edges
        const c = a + b * Math.cos((lon - sLon) * RAD);
        inside = c >= inner && c <= outer;
      }
      if (inside && start < 0) start = x;
      if (!inside && start >= 0) {
        g.fillRect(start, y, x - start, cell);
        start = -1;
      }
    }
  }
  g.restore();
}

function drawGrid(g: CanvasRenderingContext2D, w: number, h: number, u: number) {
  g.lineWidth = Math.max(1, u);
  for (let lon = -150; lon <= 150; lon += 30) {
    g.strokeStyle = lon === 0 ? LINE_STRONG : LINE;
    g.beginPath();
    g.moveTo(Math.round(toX(lon, w)) + 0.5, 0);
    g.lineTo(Math.round(toX(lon, w)) + 0.5, h);
    g.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    g.strokeStyle = lat === 0 ? LINE_STRONG : LINE;
    g.beginPath();
    g.moveTo(0, Math.round(toY(lat, h)) + 0.5);
    g.lineTo(w, Math.round(toY(lat, h)) + 0.5);
    g.stroke();
  }
  g.strokeStyle = LINE;
  g.strokeRect(0.5, 0.5, w - 1, h - 1);

  g.fillStyle = STEEL;
  g.font = `${Math.round(10 * u)}px "JetBrains Mono", ui-monospace, monospace`;
  g.textBaseline = "bottom";
  const pad = 3 * u;
  for (let lat = -60; lat <= 60; lat += 30) {
    g.fillText(lat === 0 ? "0°" : `${Math.abs(lat)}° ${lat > 0 ? "N" : "S"}`, pad, toY(lat, h) - pad / 2);
  }
  g.textBaseline = "bottom";
  for (let lon = -120; lon <= 120; lon += 60) {
    g.fillText(lon === 0 ? "0°" : `${Math.abs(lon)}° ${lon > 0 ? "E" : "W"}`, toX(lon, w) + pad, h - pad / 2);
  }
}

/**
 * The fix on an equirectangular world: lines every 30 degrees in steel, the band shaded amber at
 * 15%, the circle as an amber line (cut at the date line), each fitting place as an amber square
 * and the subsolar point as a hollow ring. No basemap: nothing is fetched.
 */
export function drawGraticule(g: CanvasRenderingContext2D, w: number, h: number, fix: ShadowFix): void {
  const u = w / UNIT_WIDTH;
  g.save();
  g.fillStyle = GLASS;
  g.fillRect(0, 0, w, h);
  drawBand(g, w, h, fix);
  drawGrid(g, w, h, u);

  g.strokeStyle = AMBER;
  g.lineWidth = 1.5 * u;
  g.lineJoin = "round";
  for (const run of splitAtAntimeridian(locus(fix.subsolar, fix.zenithDeg, 720))) {
    g.beginPath();
    run.forEach((p, i) => (i === 0 ? g.moveTo(toX(p.lon, w), toY(p.lat, h)) : g.lineTo(toX(p.lon, w), toY(p.lat, h))));
    g.stroke();
  }

  // the sun overhead: a hollow ring, so it never reads as a place the photo was taken
  g.strokeStyle = BONE;
  g.lineWidth = 1.5 * u;
  g.beginPath();
  g.arc(toX(fix.subsolar.lon, w), toY(fix.subsolar.lat, h), 5 * u, 0, 2 * Math.PI);
  g.stroke();

  const side = 7 * u;
  for (const p of fix.points) {
    const x = toX(p.lon, w) - side / 2;
    const y = toY(p.lat, h) - side / 2;
    g.fillStyle = AMBER;
    g.fillRect(x, y, side, side);
    // a black edge so the square stands off the band behind it
    g.strokeStyle = GLASS;
    g.lineWidth = u;
    g.strokeRect(x, y, side, side);
  }
  g.restore();
}
