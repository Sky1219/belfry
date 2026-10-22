---
version: 1
slug: "src-tools-shadow"
primary_target: "src/tools/shadow"
related_targets: ["src/tools/imagekit"]
---

# Surface brief: Shadow geolocation

Scope: the Shadow geolocation tool screen (src/tools/shadow), sitting in the image kit frame (src/tools/imagekit: title plate, Source screen, panel column). Visitor mode: Operate. Inside the established Monitor Wall world (DESIGN.md); no new visual world.

Shaped 2026-10-21 without a live interview: the shape ran inside an automated build task with no structured question tool and no human on the line, so every decision below is the reasonable DESIGN.md-consistent choice, open to one correction round. Assumptions are marked (A).

## Job and audience

- The developer with a phone photo of an upright thing (a lamp post, a bollard, a person standing) and its shadow, wanting to know where on Earth the photo could have been taken; and cold visitors who press "Run the demo shadow" from No Signal. They mark three points, give the time (and the shadow's compass bearing if they know it), and read where the sun stood and which places fit.
- Success: the Fix panel says, in the finding's own words, the sun's height ± its uncertainty and either one place (± a radius), two candidate places, or the circle of places; the world graticule shows it; the finding pins to the board next to its map.

## Outcome and proof

- Every title, body and number in the Fix panel comes from `shadowFinding` and the shared formatters in `shadow.ts` (rounded once, 1 dp). The view never re-rounds or parses titles. The latitude table is the one exception: its longitudes come straight from `locusAtLatitude`, at 1 dp, `--` where the circle doesn't reach.
- Honesty is the product truth. The body carries the limit sentence verbatim ("Assumes a vertical object on level ground, seen without strong perspective. Any place on this circle saw the sun at this height at that moment.") and, for one place, the radius caveat (bearing right to within 2°, camera clock right; Ruling P4-R3). Two places are shown as two (Ruling P4-R2), never one picked arbitrarily.
- No guessing the clock: without a UTC offset there is no answer, verbatim "Enter the UTC offset the photo was taken in: the same clock time is a different sun in every zone."

## Selected direction

- Visual authority: DESIGN.md as shipped. The Monitor Rule, Two Lights, Lamp Rule, Three Voices, Next Step Rule.
- Layout: the image kit frame, with one addition: a marks layer set exactly over the photo (inside `.ik-photo`), holding three mark keys and the two lines between them as SVG in photo pixel coordinates. The right-hand column holds, in order:
  1. **Time and bearing** (`panel-inputs`, lamp off: an input, nothing live). Glass: one line saying where the time came from (the photo's EXIF, the demo, or nothing: enter it); a row of three wells, Date, Time (to the second), UTC offset (mono, `+01:00`); then Shadow bearing (optional, degrees from true north, mono). One help line under the marks: drag BASE, TOP and TIP, arrow keys nudge 1 px (Shift for 10).
  2. **Fix** (`panel-fix`). Bezel readout: `EL 54.0°` in mono, `EL --` without one. Glass, top to bottom: the finding's title (amber on a computed fix, the stego verdict style); a two-row readout (Sun elevation `54.0° ± 1.2°`; Place: the point, both points, or "Circle of places"); the graticule (the focal moment); the latitude table; the finding's body; the pin key.
- Focal moment: the graticule. A 2:1 equirectangular world on black glass, no basemap and nothing fetched: hairlines every 30° in bone at 14%, the equator and prime meridian at 34%, edge labels in 10px mono steel. The ± band is the true ring between the circles at zenith ± uncertainty, rasterised on the sphere (correct at the poles and across the date line), shaded amber at 15%. The locus is a 1.5px amber polyline, split where longitude jumps across ±180 so it never streaks across the map. Each fitting place is a 7px amber square; the subsolar point is a hollow bone ring. A one-line key under it names the marks (figcaption). The same drawing, at 1440 × 720, is the PNG that pins.
- Marks: three keys labelled BASE, TOP and TIP in Label type on an 80% black plate (the Detective Vision overlay vocabulary), each over a bone crosshair square with a black halo so it reads on any photo. Lines: the object (base→top) solid bone, the shadow (base→tip) dashed bone. Marks are input, not a finding, so they are never amber. The mark being dragged turns Signal Red (selected); focus is the global red hairline and haze.

## Lamps and light

- Time and bearing: off.
- Fix: amber when the solver returns a fix (a finding: circle, one place or two); off on every refusal (degenerate marks, unplaced marks, too low, no offset, bad time, bearing mismatch, sun overhead). Refusal text is Steel Grey body copy, never amber (lessons from plans 1–3).
- The empty UTC offset well takes an Amber Dim border with an amber "Required" label: a warning on an input (Two Lights allows amber for warnings), while the panel's refusal text stays steel. (A) The brief asks for the amber highlight; this squares it with "refusals are never amber".
- No key is lit: Pin to board stays plain steel as in every image tool (Next Step Rule).

## States and ranges

- Photos 1 px to 40 MP (the kit's decode limits). Marks live in photo pixels, clamped to the photo, rendered at any screen scale.
- An uploaded photo opens with the three marks parked at sensible spots (A) and the Fix panel says "Mark the object's base, its top and the tip of its shadow." until each mark has been placed once (dragged or nudged), naming the ones still to place, so parked marks never read as a fix.
- Time: EXIF `DateTimeOriginal` + `OffsetTimeOriginal` fill all three wells (the local time and its offset). A local time with no offset fills date and time and leaves the offset empty (Review Focus 1). No EXIF time: all empty. The demo fills them from `meta.shadowDemo.timeUtc` as UTC (`+00:00`).
- Offsets typed loosely are read as people type them: `+1`, `+01`, `+0100`, `+01:00`, `-5:30`, `0`; anything else says how to type it.
- Bearing: optional; empty means no bearing; any finite number is folded into [0, 360) (Review Focus 4); `-30` reads as 330.
- Recompute: `solveShadow` re-runs 150 ms after the last change while marks are dragged or fields typed (about 25 ms with a bearing), so dragging stays smooth.
- Errors from decode: the shell's error path with "Choose another photo".

## Interaction and layout

- Marks: pointer drag with capture (the mark follows the pointer in photo pixels); arrow keys nudge the focused mark 1 px, Shift+arrow 10 px. Each is a real `button` with an accessible name stating its role and position ("Base of the object, at 412, 806"). Focus stays on the mark through a drag and a nudge.
- Pin: `pinResult` with the graticule PNG ("Shadow fix map", meta carrying the sun locus) linked to the photo, and the finding (`shadowFinding`'s title, body, detail and meta) linked to the map. The board card reads the location (`51.50…° N, 0.1…° W ± N m`) for one place, the sun elevation measurement otherwise. Pins wait on each other (`usePinQueue`, extracted to the image kit).
- The graticule canvas is `role="img"` with a short label, described by the readout; the table (`<th scope>` headers, a caption) carries the same information as text.
- Phone (≤ 860px): the frame stacks Source over the column (image kit behaviour); the three time wells wrap to two rows; marks grow to 44px targets on coarse pointers.

## After the build (critique 2026-10-22, 30/40)

- Time and bearing became a 2 × 2 grid (Date | Time, UTC offset | Shadow bearing): a 12-hour time well with seconds didn't fit a third of the column. The offset's warning sits under its well; the bearing hint is one line under the grid.
- Only the verdict and the readout are announced: the map, table and body sit in an `aria-live="off"` wrapper inside the panel's live region, so a nudge doesn't re-read eleven table rows.
- The map key states the band's width in km: at panel size a ±1.5° band is thinner than the line.
- The board (A): a fifth tool squeezed the rail. Between 721 and 1680 px the rail's tool keys go icon-only, named on hover and for screen readers, except the lit next step; on phones the action row scrolls sideways inside itself instead of widening the page. The Tools screen still lists every tool by name.

## Constraints

- No new dependencies, no new hues. Canvas colours mirror the theme constants (Bone, Steel, Amber, Glass) as the fingerprint comparison does.
- Builders must not invent: the limit sentence, the refusal messages, the finding titles and bodies, the 2° bearing tolerance, the 5° low-sun limit.
