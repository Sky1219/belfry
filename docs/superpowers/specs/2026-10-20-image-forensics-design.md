# Belfry — Image Forensics (Sub-project 2) Design

Written 2026-10-20. This covers the four image tools in `docs/next-steps.md` §3, built on the tool platform (`2026-10-19-tool-platform-design.md`).

Each tool has its own plan in `docs/superpowers/plans/2026-10-20-image-forensics-*.md`. Plan 1 also builds the shared image kit that plans 2–4 use.

## 1. Decisions (defaults, open to veto)

| Question | Decision |
|---|---|
| Formats | JPEG, PNG and WebP get full support. GIF and BMP get pixel tools only (no metadata). HEIC works only where the browser decodes it (Safari); elsewhere the tool says *"This browser can't decode HEIC. Convert it to JPEG first."* |
| Image size | Images up to 40 megapixels are analysed. Above that, the tool refuses with *"This photo is over 40 megapixels; Belfry can't analyse it in the browser."* Copy-move and fingerprint work run on a downscaled copy (copy-move: long side 512 px; fingerprints: 640 px). Every other test sees full-resolution pixels. |
| Orientation | Pixels are decoded with EXIF orientation applied (`createImageBitmap(..., { imageOrientation: "from-image" })`), so maps and marks line up with the photo as it is displayed. |
| Uncertainty wording | A test that gives a verdict uses exactly one of three titles: `"<Test>: consistent with <subject>"`, `"<Test>: no sign of <subject>"` or `"<Test>: inconclusive"`. The body states the statistic, the threshold it was compared with, and the test's fixed limit sentence (§7). Never "proves", "fake", "authentic", "identified" or "match confirmed". ELA and noise residual are maps, not verdicts: they pin a map and a reading guide. |
| Fingerprint privacy | On open, the tool shows a notice until it's acknowledged (stored in tool settings): *"Compare your own prints only. Prints are processed on this device and never leave it. This is not an identification."* Results carry the same last sentence. |
| Demo inputs | Every demo is generated in the browser from a seeded generator (no shipped photos). It is pinned to the board first, as an exhibit tagged `demo`, so every result derives from an exhibit. |
| Dependencies | No new runtime dependencies. JPEG markers, EXIF/TIFF, XMP, PNG chunks, the DCT, Gabor filters, the statistics and the solar position are all written here and unit-tested. |
| LLM | None of these tools call the LLM, so they work fully without a key. |
| Heavy maths | Copy-move matching and fingerprint enhancement run as ops on the shared `WorkerPool` (`compute.worker`). Everything else is fast enough on the main thread at these sizes (each test under 300 ms at 12 MP on a mid laptop). |

## 2. The image kit (`src/tools/imagekit/`)

- **`Pixels`**: `{ width; height; data: Uint8ClampedArray }`, RGBA, ImageData-compatible.
- **Pure helpers**, unit-tested in Node:
  - grayscale (BT.601)
  - box downscale
  - seeded RNG (mulberry32)
  - the amber heat-map ramp (black → `#ffa733` → white, clipped at the 1st/99th percentile)
  - `fitWithin`, the 40 MP gate
  - verdict selection and copy
- **Browser glue:**
  - `decodeImage` / `encodeImage`, through OffscreenCanvas.
  - `useToolImage`, which resolves `ctx.input` to `{ source, blob, bytes, pixels }`. A demo input is generated and pinned first.
  - `pinResult`, which pins an optional map image plus one finding, linked `derived-from`: map → source, and finding → map (or → source when there's no map). Results are placed beside the source with `placeNear`.
- **Screens:**
  - `ImageToolShell`: a title plate, the source on one bezelled screen with an overlay canvas, analysis panels as bezelled screens, and *Back to board*. It follows The Monitor Rule, so `/impeccable shape` is run per tool before its UI task.
  - `ExhibitPicker`: choose a second image from the case or from a file. Used by the fingerprint lab.
- **Manifest:** gains an optional `icon: IconName`. The rack and toolbar use it (default `vision`). New icons: `forensics`, `fingerprint`, `stego`, `sun`.

## 3. Photo forensics (`photo-forensics`)

| Panel | Core | Output |
|---|---|---|
| Metadata | EXIF (IFD0, Exif IFD, GPS), XMP (`xmp:CreatorTool`, `xmp:ModifyDate`, `photoshop:History`, `stEvt:softwareAgent`), PNG `tEXt`/`iTXt`/`eXIf`, WebP `EXIF`/`XMP `. | A read-out. Pins a finding listing the fields; with GPS, the detail is a `location`. Editing software in the metadata is stated as a fact, not a verdict. |
| JPEG | DQT parse, IJG quality estimate (±1 when the tables are IJG-scaled; otherwise "non-standard tables"), and a double-quantization periodicity score on the low-frequency DCT histograms. | Pins the quality as a `measurement`; the DQ verdict uses its thresholds (§7). Not a JPEG → the panel says *"Not a JPEG: quantization tests don't apply."* |
| ELA | Recompress at quality 90 and take the absolute difference ×20, per pixel, as max over the RGB channels. | A heat map and its reading guide. |
| Noise residual | The image minus its 3×3 median. Local σ in 16 px blocks, each block normalised by the image's median σ. | A heat map, and the inconsistency score (block σ coefficient of variation) as a `measurement`. |
| Copy-move | 8×8 blocks with stride 1 at long side ≤512 px. The features are 9 low-frequency DCT coefficients, quantized by 2.5. Sort them lexicographically and compare neighbours within 10 rows. Keep pairs whose shift is ≥ 16 px, then count blocks per shift vector. | An overlay map of the cloned regions, plus the verdict. |

The demo is a seeded synthetic scene with one region cloned (shift (+96, +40)) and one patch pasted from a copy compressed at a different quality. The whole image is then saved as JPEG at quality 90.

## 4. Fingerprint lab (`fingerprint-lab`)

The pipeline runs on both prints, each a grayscale image downscaled to a long side of 640 px:

1. Normalise to mean 0 and variance 1, and take a block mask (16 px blocks with variance ≥ 0.1).
2. Orientation field from the gradient structure tensor in 16 px blocks, smoothed as doubled-angle vectors.
3. Ridge frequency from projection peaks, kept in [1/25, 1/3] px⁻¹.
4. Gabor enhancement, oriented per block (σ = 4 px).
5. Binarise at 0, then Zhang–Suen thinning.
6. Crossing-number minutiae (endings CN = 1, bifurcations CN = 3). Drop minutiae within 10 px of the mask border, and pairs closer than 6 px.

**Matching:** for each pair of minutiae (one from each print), align by translation and rotation, then count the minutiae that land within 10 px and 20° of each other. The best alignment wins. The score is `matched / ((n1 + n2) / 2)`.

**Output:**
- An overlay image: both prints side by side, matched pairs joined by amber lines.
- A finding with the score as a `measurement` (unit `match score`) and its verdict.
- Fewer than 12 minutiae in either print → *"Fingerprint match: inconclusive"*, with *"not enough ridge detail"* and no score.

**Demo:** two seeded synthetic loop patterns. Print B is print A rotated 15° and shifted (30, −20) px, with noise added.

## 5. Steganography lab (`stego-lab`)

- **Format:** sequential LSB over R, G, B, row-major. Alpha is untouched. Pixels that aren't fully opaque are skipped, because browsers premultiply them and their RGB bits don't survive a canvas round trip. The header is the magic bytes `BLFY`, then the payload length as a uint32 big-endian, then the UTF-8 payload.
- **Extract:** returns `null` without the magic.
- **Embed:** writes a PNG `image` evidence derived from the source. It is never re-encoded as JPEG, because that would destroy the payload; a JPEG source still yields a PNG. Over capacity → *"That message needs N bytes; this image holds M."*
- **Chi-square attack (Westfeld–Pfitzmann):** runs over the pairs of values in the first k% of the image, for k = 10…100. The embedding probability is `1 − chi2cdf(X², df)`.
- **RS steganalysis (Fridrich):** uses 2×2 groups, mask [0 1 1 0] and smoothness as the sum of absolute neighbour differences. It estimates the embedded fraction p̂.
- **Output:**
  - A payload found → a `decode` finding (scheme `LSB`).
  - Otherwise a finding with p̂ as a `measurement` (unit `of capacity`) and the combined verdict. A chart of the chi-square probability against k is drawn in the panel.
- **Demo:** a seeded synthetic photo with *"The bell was stopped at 04:10 from the east bracket."* embedded.

## 6. Shadow geolocation (`shadow-geolocation`)

- **Inputs:**
  - **Marks:** the user drags three marks on the photo: object base, object top and shadow tip. Arrow keys nudge the focused mark 1 px.
  - **Time:** taken from EXIF `DateTimeOriginal` + `OffsetTimeOriginal` when both exist. Otherwise the user enters a date, a time and a UTC offset; with no offset there is no answer.
  - **Bearing:** an optional shadow bearing in degrees from true north.
- **Core:**
  - The NOAA solar position (declination, equation of time, refraction-corrected elevation, azimuth) and the subsolar point.
  - Sun elevation is `atan(|top − base| / |tip − base|)`, assuming a vertical object casting its shadow on level ground in a view that foreshortens both alike. Uncertainty comes from ±3 px per mark, propagated numerically.
  - Elevation below 5° is refused: *"The sun is too low for a reliable fix."*
- **Output without a bearing:**
  - A circle of places 90° − elevation from the subsolar point.
  - It is drawn on a graticule (no basemap, nothing fetched) and listed at 15° latitude steps.
  - The finding is a `measurement` of sun elevation, with `meta.sunLocus = { subsolarLat, subsolarLon, zenithDeg, bandDeg }`.
- **Output with a bearing:** the point on the circle where the sun's azimuth equals bearing + 180°, as a `location` ± radius (the band width converted to metres).
- **Demo:** a synthetic pole and shadow drawn for 51.50° N, 0.12° W at 2026-06-21 14:00 UTC. The marks and the bearing come pre-filled.

## 7. Fixed copy (limit sentences)

- **ELA:** "Regions much brighter than similar texture nearby were compressed differently. Resaving, resizing and filters also change error levels, so read the map, don't count it."
- **Noise residual:** "Pasted regions often carry different sensor noise. Smooth areas, blur and heavy compression also lower noise."
- **Copy-move:** consistent at ≥ 40 blocks on one shift vector; inconclusive at 15–39. "Repeating textures (brick, tiles, foliage) can match themselves."
- **Double quantization:** consistent at a score ≥ 0.50; inconclusive at 0.30–0.49. "A photo saved twice as JPEG shows this whether or not it was edited in between."
- **Fingerprint:** consistent at a score ≥ 0.40 with ≥ 12 matched minutiae; inconclusive at 0.25–0.39. "Hobby-grade matching of two photos. This is not an identification."
- **Stego:** consistent when chi-square p ≥ 0.95 at k = 100% or RS p̂ ≥ 0.10; inconclusive when p ≥ 0.50 or p̂ ≥ 0.05. "Only detects sequential LSB embedding. Absence of a signal isn't proof of a clean image."
- **Shadow:** "Assumes a vertical object on level ground, seen without strong perspective. Any place on this circle saw the sun at this height at that moment."

## 8. Testing

- **Unit tests (Node):** every algorithm against synthetic fixtures, with exact values from §3–§7.
  - IJG table scaling for quality 10–100.
  - EXIF from bytes built by a test helper.
  - DQ on single- versus double-quantized Laplacian coefficients.
  - Copy-move on a seeded texture with a known shift.
  - Fingerprint orientation, thinning, crossing number, and matching on the seeded pair.
  - LSB round trip; chi-square CDF at known points; RS on 0%, 50% and 100% embedding.
  - Solar declination at the solstices, the equation of time on Feb 13 and Nov 3, and azimuth fixes round-tripped.
- **Playwright:** one flow per tool. Run its demo, wait for the panels, pin a result, close the tool, and check that the board has the result linked to the demo exhibit.

## 9. Out of scope

- A basemap or patrol map.
- HEIC decoding in browsers that can't do it.
- Video frames as input.
- PRNU camera identification.
- LLM descriptions of the results.
