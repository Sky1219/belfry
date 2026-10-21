# Shadow Geolocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a photo with an object and its shadow marked, the time it was taken, and optionally the shadow's bearing, compute where on Earth it could have been taken. Results are pinned to the board as a circle of places or a point.

**Architecture:**
- Pure modules in `src/tools/shadow/`:
  - `solar.ts`: the NOAA solar position and subsolar point
  - `geo.ts`: spherical geometry, the circle of equal sun height, the azimuth fix
  - `shadow.ts`: sun elevation from marks, photo time, the finding
- The view uses plan 1's image kit and draws the result on a graticule canvas. Nothing is fetched.

**Tech Stack:** TypeScript 5, React 19, Vitest 3, Playwright 1.56. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-image-forensics-design.md` (§1, §6, §7)

**Depends on:**
- plan 1, Tasks 1–2: `Pixels`, `pinResult`, `useToolImage`, `ImageToolShell`, `ToolPanel`, `encodeImage`, the `sun` icon
- plan 1, Task 3: `PhotoMetadata`, `readMetadata`

## Global Constraints

- Tool id `shadow-geolocation`. `accepts: ["image"]`. Demo label `"Run the demo shadow"`. Icon `sun`.
- Angles are in degrees at every interface. Azimuths and bearings are clockwise from true north, in [0, 360). Longitudes are in (−180, 180].
- Solar position: the NOAA algorithm (Julian century, mean anomaly, equation of centre, obliquity), with NOAA's refraction correction for apparent elevation.
- Each mark is ±3 px. A sun elevation below 5° is refused, verbatim: `The sun is too low for a reliable fix.`
- Degenerate marks (object or shadow shorter than 5 px), verbatim: `Mark the object's base, its top and the tip of its shadow.`
- Without a UTC offset there is no answer, verbatim: `Enter the UTC offset the photo was taken in: the same clock time is a different sun in every zone.`
- Earth radius 6,371,008.8 m. 1° of arc = 111,195 m.
- Limit sentence, verbatim: `Assumes a vertical object on level ground, seen without strong perspective. Any place on this circle saw the sun at this height at that moment.`
- Demo: 51.50° N, 0.12° W at `2026-06-21T14:00:00Z`.
- Every screen is a `Bezel`. Run `/impeccable shape shadow-geolocation` before Task 4 and `/impeccable critique src/tools/shadow` after it.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A photo with a local time but no UTC offset** (most cameras): the tool asks for the offset and never guesses one. Pinned in Task 3 (`photoTimeUtc` returns null) and Task 4 (the offset field shows when it's missing).
2. **A circle that crosses the date line or passes over a pole:** longitudes stay in (−180, 180], and the latitude listing handles latitudes the circle doesn't reach. Pinned in Task 2.
3. **The sun near the horizon** (long evening shadows): refused below 5°, and refraction is handled between apparent and geometric elevation. Pinned in Tasks 1 and 3.
4. **A bearing typed as −30 or 390:** normalised to 330 or 30. Pinned in Task 3.
5. **Marks dragged on top of each other:** the degenerate message, no `NaN` and no `Infinity`. Pinned in Task 3.

---

### Task 1: Solar position (NOAA) and subsolar point

**Files:**
- Create: `src/tools/shadow/solar.ts`
- Test: `tests/unit/solar.test.ts`

**Interfaces:**
- Produces:
  - `interface LatLon { lat: number; lon: number }`
  - `solarPosition(date: Date, lat: number, lon: number): { elevationDeg: number; geometricElevationDeg: number; azimuthDeg: number; declinationDeg: number; eqTimeMin: number }`
  - `subsolarPoint(date: Date): LatLon`
  - `refractionDeg(geometricElevationDeg: number): number`
  - `apparentToGeometric(apparentDeg: number): number`: inverted by fixed-point iteration.

- [ ] **Step 1: Write the failing tests:**
  - Declination:
    - `2026-06-21T12:00Z` → 23.43 ± 0.05
    - `2026-12-21T12:00Z` → −23.43 ± 0.05
    - `2026-03-20T12:00Z` → |decl| < 0.5
  - Equation of time: `2026-02-13T12:00Z` → −14.2 ± 0.4 min; `2026-11-03T12:00Z` → +16.4 ± 0.4 min.
  - At `subsolarPoint(d)` for 3 dates, `geometricElevationDeg` > 89.9.
  - At 51.5° N, 0° on `2026-06-21`, at the minute of highest elevation between 11:30 and 12:30 UTC: azimuth 180 ± 1, and geometric elevation 90 − 51.5 + declination ± 0.2.
  - `apparentToGeometric(e + refractionDeg(e))` returns e within 1e-6, for e in {5, 10, 30, 60}.
- [ ] **Step 2: Run** `npx vitest run tests/unit/solar.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the NOAA spreadsheet equations.
  - Subsolar longitude = −15 × (UTC hours − 12 + eqTime / 60), normalised. Subsolar latitude = the declination.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shadow): NOAA solar position and subsolar point`

### Task 2: Spherical geometry, the circle of equal sun height, the azimuth fix

**Files:**
- Create: `src/tools/shadow/geo.ts`
- Test: `tests/unit/shadowGeo.test.ts`

**Interfaces:**
- Consumes: Task 1 `LatLon`, `solarPosition`, `subsolarPoint`
- Produces:
  - `normalizeLon(lon: number): number`
  - `angularDistanceDeg(a: LatLon, b: LatLon): number`
  - `destination(from: LatLon, bearingDeg: number, distDeg: number): LatLon`
  - `initialBearingDeg(from: LatLon, to: LatLon): number`
  - `locus(subsolar: LatLon, zenithDeg: number, n?: number): LatLon[]`. `n` defaults to 360.
  - `locusAtLatitude(subsolar: LatLon, zenithDeg: number, lat: number): number[]`: 0, 1 or 2 longitudes.
  - `fixFromAzimuth(subsolar: LatLon, zenithDeg: number, sunAzimuthDeg: number): LatLon | null`

- [ ] **Step 1: Write the failing tests:**
  - Every `locus` point is at `angularDistanceDeg` = zenith from the subsolar point (1e-9).
  - `destination({0, 179}, 90, 2)` → lon −179 (Review Focus 2).
  - `locusAtLatitude` with the subsolar point at (23.4, 0) and zenith 30:
    - lat 80 → `[]`
    - lat 53.4 → one longitude, ≈ 0
    - lat 40 → two longitudes, symmetric about 0
    - all within (−180, 180]
  - Round trip: observers London (51.5, −0.12), Sydney (−33.87, 151.21), Nairobi (−1.29, 36.82), Reykjavik (64.15, −21.94), Lima (−12.05, −77.04) and Tokyo (35.68, 139.69), each at 06:00, 12:00 and 18:00 UTC on 2026-06-21:
    1. Skip combinations whose geometric elevation is below 10°.
    2. zenith = 90 − geometric elevation. `fixFromAzimuth(subsolar, zenith, azimuth)` must be within 0.1° of the observer.
- [ ] **Step 2: Run** `npx vitest run tests/unit/shadowGeo.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the standard haversine and destination formulas.
  - `locusAtLatitude` solves cos z = sin φ sin φₛ + cos φ cos φₛ cos Δλ for Δλ.
  - `fixFromAzimuth`:
    1. Sample the locus at 3,600 points. For each, compute the `initialBearingDeg` to the subsolar point, which is the sun's azimuth seen from there.
    2. Take the point with the least angular difference to `sunAzimuthDeg`, and refine with 30 bisection steps between its neighbours.
    3. Return `null` when the best difference is above 1°.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shadow): circle of equal sun height and azimuth fix`

### Task 3: Elevation from marks, photo time, and the finding

**Files:**
- Create: `src/tools/shadow/shadow.ts`
- Test: `tests/unit/shadow.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; plan 1's `PhotoMetadata`.
- Produces:
  - `interface Pt { x: number; y: number }`
  - `elevationFromMarks(m: { base: Pt; top: Pt; tip: Pt }, pxSigma?: number): { elevationDeg: number; uncertaintyDeg: number } | { error: "too-low" | "degenerate"; message: string }`. `pxSigma` defaults to 3.
  - `photoTimeUtc(meta: Pick<PhotoMetadata, "dateTimeOriginal" | "offsetTimeOriginal">): Date | null`
  - `parseOffset(s: string): number | null`: minutes, e.g. `"+05:30"` → 330.
  - `normalizeBearing(deg: number): number`
  - `interface ShadowFix { timeUtc: Date; elevationDeg: number; uncertaintyDeg: number; subsolar: LatLon; zenithDeg: number; point: LatLon | null }`
  - `solveShadow(input: { marks: { base: Pt; top: Pt; tip: Pt }; timeUtc: Date; shadowBearingDeg?: number }): ShadowFix | { error: string }`
  - `shadowFinding(fix: ShadowFix): { title: string; body: string; detail: FindingDetail; meta: { sunLocus: { subsolarLat: number; subsolarLon: number; zenithDeg: number; bandDeg: number } } }`

- [ ] **Step 1: Write the failing tests:**
  - Marks: base (100, 300), top (100, 200), tip (200, 300) → elevation 45 ± 1e-9, with uncertainty in (1.5, 4).
  - base (100, 300), top (100, 295), tip (200, 300) → `{ error: "degenerate" }` (object < 5 px).
  - base (0, 300), top (0, 280), tip (400, 300) → elevation 2.86° → `{ error: "too-low", message: "The sun is too low for a reliable fix." }` (Review Focus 3).
  - All three marks at the same point → `degenerate`, and nothing in the result is NaN or Infinity (Review Focus 5).
  - Photo time:
    - `photoTimeUtc({ dateTimeOriginal: "2026:06:21 15:00:00", offsetTimeOriginal: "+01:00" })` → `2026-06-21T14:00:00.000Z`
    - with no offset → `null` (Review Focus 1)
    - `"2026:13:40 99:00:00"` → `null`
    - `parseOffset("-03:30")` → −210
  - `normalizeBearing(-30) === 330` and `normalizeBearing(390) === 30` (Review Focus 4).
  - `solveShadow` on marks built from the demo truth (51.50, −0.12 at 14:00Z, object 200 px, shadow = 200 / tan(apparent elevation)), with bearing = sun azimuth + 180 → `point` within 0.5° of the truth.
    - The elevation entering the geometry is `apparentToGeometric` of the measured one.
    - Without a bearing → `point === null`.
  - `shadowFinding`:
    - Without a point → title `` `Sun elevation: ${elevationDeg.toFixed(1)}° ± ${uncertaintyDeg.toFixed(1)}°` `` (e.g. `"Sun elevation: 52.3° ± 2.1°"`), with detail `{ kind: "measurement", value: elevation, unit: "° sun elevation", uncertainty }` and `meta.sunLocus.bandDeg === uncertainty`.
    - With a point → title `"Shadow fix: <|lat|.toFixed(1)>° N|S, <|lon|.toFixed(1)>° E|W"` (e.g. `"Shadow fix: 51.5° N, 0.1° W"`), with detail `{ kind: "location", lat, lon, radiusM: Math.round(uncertainty × 111195) }`.
    - The body ends with the limit sentence and states the UTC time as `2026-06-21 14:00 UTC`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/shadow.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Elevation: atan2(|top − base|, |tip − base|).
  - Uncertainty: perturb each of the 6 coordinates by ±σ, take the largest elevation change per coordinate, and combine them as the root sum of squares.
  - `solveShadow`: the sun azimuth is the normalised bearing + 180. If `fixFromAzimuth` returns `null` with a bearing given, the error is `"That bearing doesn't fit this sun height at that time."`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shadow): elevation from marks, photo time and shadow finding`

### Task 4: Shadow geolocation view and board loop

**Files:**
- Create:
  - `src/tools/shadow/manifest.ts`
  - `src/tools/shadow/ShadowView.tsx`
  - `src/tools/shadow/graticule.ts`
  - `src/tools/shadow/demo.ts`
  - `src/tools/shadow/shadow.css`
  - `tests/e2e/shadow.spec.ts`
- Modify:
  - `src/main.tsx` (register)
  - `docs/manual-checklist.md` (a "Shadow geolocation" section: a phone photo of a lamp post with a known place and time)
  - `docs/next-steps.md` (tick the tool, and tick Sub-project 2 once all four plans are done)

**Interfaces:**
- Consumes: Tasks 1–3; plan 1's kit, `readMetadata`.
- Produces:
  - `shadowManifest` with `{ id: "shadow-geolocation", name: "Shadow geolocation", blurb: "Where a photo could have been taken, from a shadow and the time", accepts: ["image"], demo: { label: "Run the demo shadow" }, icon: "sun" }`
  - `drawGraticule(g: CanvasRenderingContext2D, w: number, h: number, fix: ShadowFix): void`
    - Equirectangular, with lines every 30° in steel grey.
    - The locus as an amber polyline with the ±band shaded at 15% opacity.
    - The point as an amber square.
    - The subsolar point as a hollow circle.
  - `makeShadowDemo(): Promise<{ bytes: Uint8Array; mime: "image/png"; title: "Demo photo — lamp post"; meta: { shadowDemo: { marks: { base: Pt; top: Pt; tip: Pt }; timeUtc: string; bearingDeg: number } } }>`

- [ ] **Step 1: Run `/impeccable shape shadow-geolocation`.**
- [ ] **Step 2: Write the failing e2e test** `tests/e2e/shadow.spec.ts`:
  - **`"demo: pre-filled marks give a fix near London that pins as a location"`:**
    1. Click `run-demo`.
    2. `panel-fix` matches `/5[01]\.\d° N/` and `/0\.\d° W/` (timeout 10 s).
    3. `panel-fix` contains the limit sentence.
    4. Click `pin-fix` and close. The board has 3 cards (demo photo, graticule image, finding), and the finding's `finding-readout` contains `"° N"`.
  - **`"without an offset the tool asks for one"`:**
    1. Open the demo exhibit and clear the `shadow-offset` field.
    2. `panel-fix` contains `"Enter the UTC offset"` and no `"° N"` (Review Focus 1).
- [ ] **Step 3: Run** `npx playwright test tests/e2e/shadow.spec.ts`. Expected: FAIL.
- [ ] **Step 4: Implement the view.**
  - **Marks:** three draggable marks on the overlay, labelled `BASE`, `TOP` and `TIP`. Each is a focusable button (`mark-base`, `mark-top`, `mark-tip`) that arrow keys nudge 1 px.
  - **Time:**
    - Fields `shadow-date`, `shadow-time` and `shadow-offset`, filled from `photoTimeUtc(readMetadata(bytes))` when possible, or from `meta.shadowDemo`.
    - The offset field is highlighted amber when it's empty.
  - **Bearing:** an optional `shadow-bearing` field.
  - **Fix panel:** the `panel-fix` readout shows elevation ± uncertainty, then the point or "circle of places". The graticule canvas comes next, then a table of the locus longitudes at latitudes −75…75 in 15° steps (`--` where the circle doesn't reach).
  - **Pin:** `pinResult` with the graticule PNG and `shadowFinding`.
  - **Demo:** draw a sky, a ground plane, a 200 px pole and its shadow at the demo truth's apparent elevation. The marks sit on the drawn endpoints.
  - Register the manifest.
- [ ] **Step 5: Run** `npx playwright test tests/e2e/shadow.spec.ts`. Expected: PASS.
- [ ] **Step 6: Run** `npx tsc --noEmit && npx vitest run && npx playwright test`. Expected: all pass.
- [ ] **Step 7: Run `/impeccable critique src/tools/shadow`.** Fix P0/P1 findings and re-run Step 6.
- [ ] **Step 8: Commit** `feat(shadow): shadow geolocation with graticule and pinned fix`
