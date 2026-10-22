# Image Kit + Photo Forensics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared image-tool kit and the Photo forensics tool: metadata, JPEG quantization, ELA, noise residual and copy-move, with every result pinned to the board.

**Architecture:**
- The algorithms are pure TypeScript over a `Pixels` struct, unit-tested in Node.
- Browser glue (decode/encode, pinning, the tool shell) lives in `src/tools/imagekit/`, and plans 2–4 reuse it.
- Copy-move runs as an op on the shared `WorkerPool`.
- The tool is a manifest plus a React view, like Detective Vision.

**Tech Stack:** TypeScript 5, React 19, Vitest 3 (Node, `fake-indexeddb`), Playwright 1.56, OffscreenCanvas, the existing `WorkerPool` / `compute.worker`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-image-forensics-design.md` (§1, §2, §3, §7, §8)

## Global Constraints

- No new runtime dependencies. Every parser and algorithm is written here.
- Tool ids: `photo-forensics`. `accepts: ["image"]`. Demo label: `"Run the demo photo"`. Icon: `forensics`.
- Max decode: 40,000,000 pixels. Above that, throw exactly: `This photo is over 40 megapixels; Belfry can't analyse it in the browser.`
- HEIC/HEIF that fails to decode → exactly `This browser can't decode HEIC. Convert it to JPEG first.`
- Decode with `createImageBitmap(blob, { imageOrientation: "from-image" })`.
- Copy-move analysis runs at long side ≤ 512 px; every other test runs on full-resolution pixels.
- Verdict titles are exactly `"<Test>: consistent with <subject>"`, `"<Test>: no sign of <subject>"` or `"<Test>: inconclusive"`. Never "proves", "fake", "authentic", "identified".
- Thresholds:
  - copy-move: consistent ≥ 40 blocks, inconclusive 15–39
  - double quantization: consistent ≥ 0.50, inconclusive 0.30–0.49
- Limit sentences are verbatim from spec §7.
- Heat-map ramp: black → `#ffa733` → white, clipped at the 1st and 99th percentiles.
- A demo input is pinned to the board first (tag `demo`), then the tool opens on that exhibit.
- No DC/Warner names or marks. Every new screen is a `Bezel` (The Monitor Rule). Run `/impeccable shape photo-forensics` before Task 8's UI and `/impeccable critique src/tools/photo` after it.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A 48 MP phone photo:** the tool refuses with the 40 MP message instead of freezing the tab. Pinned in Task 1 (`fitWithin`) and Task 2 (`decodeImage` throws the exact copy).
2. **A portrait phone photo stored rotated (EXIF Orientation 6):** maps and overlays line up with the photo as displayed. Pinned in Task 3 (orientation is read) and Task 8 (the e2e test checks that the map's size equals the decoded size).
3. **A PNG screenshot or WebP:** the JPEG panel says `Not a JPEG: quantization tests don't apply.` and shows no quality number. Pinned in Task 4 (`readJpeg` returns null) and Task 8 (the e2e test opens a PNG).
4. **Corrupt or hostile metadata** (offsets past the end, an IFD that points to itself, a truncated file): the parser returns what it could read plus warnings, and never throws or loops. Pinned in Task 3.
5. **A tiny or flat image** (1×1, all one colour): no `NaN` anywhere, and verdicts read inconclusive. Pinned in Tasks 5 and 6, and the 1×1 PNG in Task 8.

---

### Task 1: Image kit maths

**Files:**
- Create: `src/tools/imagekit/pixels.ts`, `src/tools/imagekit/rng.ts`, `src/tools/imagekit/heatmap.ts`, `src/tools/imagekit/verdict.ts`
- Test: `tests/unit/imagekit.test.ts`

**Interfaces:**
- Produces:
  - `interface Pixels { width: number; height: number; data: Uint8ClampedArray }` (RGBA)
  - `makePixels(w: number, h: number, rgba?: [number, number, number, number]): Pixels`
  - `toGray(p: Pixels): Float32Array` (BT.601: 0.299 R + 0.587 G + 0.114 B, 0–255)
  - `downscale(p: Pixels, maxSide: number): Pixels`: box filter. Returns `p` itself when already within.
  - `MAX_PIXELS = 40_000_000`
  - `fitWithin(w: number, h: number, max = MAX_PIXELS): boolean`
  - `mulberry32(seed: number): () => number`, in [0, 1)
  - `percentile(values: ArrayLike<number>, q: number): number`: ignores non-finite values. Returns `NaN` only for an empty input.
  - `heatmapPixels(values: Float32Array, w: number, h: number, range?: { lo: number; hi: number }): Pixels`
  - `type Verdict = "consistent" | "no-sign" | "inconclusive"`
  - `verdictFor(score: number | null, t: { inconclusiveAt: number; consistentAt: number }): Verdict`
  - `verdictTitle(test: string, v: Verdict, subject: string): string`

- [ ] **Step 1: Write the failing tests** in `tests/unit/imagekit.test.ts`:
  - `toGray` of one pure-red pixel → `[76.245]` (toBeCloseTo, 3).
  - `downscale` of a 4×4 image (left half 0, right half 200) at maxSide 2 → 2×2 with R values `[0, 200, 0, 200]`. Downscaling a 3×2 image at maxSide 8 returns the same object (`toBe`).
  - `fitWithin(8000, 5000)` is true; `fitWithin(8000, 5001)` is false.
  - `mulberry32(42)` gives the same 5 numbers twice. `mulberry32(42)` and `mulberry32(43)` differ on the first draw, and all draws are in [0, 1).
  - `percentile([1,2,3,4,5,NaN], 0.5)` → 3. `percentile([], 0.5)` is NaN.
  - `heatmapPixels(Float32Array.of(0, 5, 10), 3, 1, { lo: 0, hi: 10 })` → pixels `[0,0,0,255]`, `[255,167,51,255]`, `[255,255,255,255]`. A value of −5 clips to black.
  - Without a range, the lo and hi come from the 1st and 99th percentiles.
  - `verdictFor(0.6, {inconclusiveAt: 0.3, consistentAt: 0.5})` → `"consistent"`; 0.4 → `"inconclusive"`; 0.1 → `"no-sign"`; `null` → `"inconclusive"`.
  - `verdictTitle("Copy-move", "consistent", "cloned regions")` → `"Copy-move: consistent with cloned regions"`; `"no-sign"` → `"Copy-move: no sign of cloned regions"`; `"inconclusive"` → `"Copy-move: inconclusive"`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/imagekit.test.ts`. Expected: FAIL (modules not found).
- [ ] **Step 3: Implement** the four modules. The ramp: for t = clamp((v − lo)/(hi − lo)) — black→amber over t∈[0, 0.5], amber→white over t∈[0.5, 1], rounded. When `hi === lo`, every pixel is black.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(imagekit): pixels, seeded rng, heat-map ramp and verdict copy`

### Task 2: Image kit glue: decoding, pinning, shell, icons

**Files:**
- Create:
  - `src/tools/imagekit/decode.ts`
  - `src/tools/imagekit/pin.ts`
  - `src/tools/imagekit/useToolImage.ts`
  - `src/tools/imagekit/ImageToolShell.tsx`
  - `src/tools/imagekit/ExhibitPicker.tsx`
  - `src/tools/imagekit/imagekit.css`
- Modify:
  - `src/tools/types.ts`: `ToolManifest.icon?: IconName`
  - `src/ui/icons.tsx`: icons `forensics`, `fingerprint`, `stego`, `sun`, on the same 16 px grid with a 1.5 px stroke
  - `src/board/Board.tsx` and `src/board/Instruments.tsx`: `BoardTool.icon`; buttons use `t.icon ?? "vision"`
  - `src/app/App.tsx`: pass `icon` through
- Test: `tests/unit/pin.test.ts`

**Interfaces:**
- Consumes:
  - Task 1 `Pixels`, `fitWithin`
  - `EvidenceStore`, `placeNear`, `wallGeometry`, `makeThumbnail`, `readEvidenceBlob`, `pickableEvidence`, `fileAcceptFor`, `addEvidenceFiles`
  - `FindingDetail`
- Produces:
  - `class ImageTooLargeError extends Error`
  - `decodeImage(blob: Blob): Promise<Pixels>`
  - `encodeImage(p: Pixels, mime: "image/png" | "image/jpeg", quality?: number): Promise<Uint8Array>`
  - `interface PinDeps { store: EvidenceStore; caseId: string; toolId: string; thumbnail?: (b: Blob) => Promise<Uint8Array> }`
  - `interface PinRequest { source: Evidence; image?: { bytes: Uint8Array; mime: string; title: string; meta?: Record<string, unknown> }; finding: { title: string; body: string; detail?: FindingDetail; meta?: Record<string, unknown> } }`
  - `pinResult(deps: PinDeps, req: PinRequest): Promise<{ image?: Evidence; finding: Evidence }>`
  - `pinDemoInput(deps: PinDeps, demo: { bytes: Uint8Array; mime: string; title: string; meta?: Record<string, unknown> }): Promise<Evidence>`
  - `useToolImage(ctx: ToolContext, makeDemo: () => Promise<{ bytes: Uint8Array; mime: string; title: string; meta?: Record<string, unknown> }>): { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; source: Evidence; bytes: Uint8Array; mime: string; pixels: Pixels }`
  - `ImageToolShell` props:
    - `{ tool: ToolManifest; ctx: ToolContext; source?: Evidence; pixels?: Pixels; drawOverlay?: (g: CanvasRenderingContext2D) => void; children: ReactNode }`
  - `ToolPanel` props:
    - `{ id: string; title: string; lamp: LampState; readout?: ReactNode; onPin?: () => Promise<void>; pinned?: number; children: ReactNode }`
    - The pin key has `data-testid="pin-<id>"`; the panel has `data-testid="panel-<id>"`.
  - `ExhibitPicker` props: `{ caseId: string; store: EvidenceStore; excludeId?: string; onPick(e: Evidence): void }`. The root has `data-testid="exhibit-picker"`, each row `data-testid="exhibit-picker-item"`, and the file key `data-testid="exhibit-picker-file"`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/pin.test.ts` (`fake-indexeddb/auto`, a fresh store per test, `thumbnail: async () => new Uint8Array([1])`):
  - `"pins a map and a finding beside the source, linked map→source and finding→map"`:
    - Both new exhibits have `provenance.toolId === "photo-forensics"` and `sourceEvidenceId === source.id`.
    - The links are exactly `[{from: map, to: source, kind: "derived-from"}, {from: finding, to: map, kind: "derived-from"}]`.
    - The three positions are distinct.
    - The finding's `meta.finding` equals the passed `detail`.
  - `"without a map the finding links to the source"`.
  - `"a demo input is tagged demo and has the tool's provenance"`: `tags` is `["demo"]`, `provenance.toolId` is set, and `meta.staged` is `true`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/pin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `pin.ts`.
  - Placement is `placeNear(taken, source.position, image ? 2 : 1, segments)`: the map takes the first slot, the finding the second.
  - Pinned images get a thumbnail through `deps.thumbnail ?? makeThumbnail`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Implement the browser glue** (covered by Task 8's e2e test):
  - **`decodeImage`:** reject `!fitWithin` with `ImageTooLargeError` and the exact copy. A decode failure on `image/heic` / `image/heif` becomes the HEIC copy.
  - **`useToolImage`:**
    - `demo` → `makeDemo()` → `pinDemoInput` → `ctx.openInput("ev:" + id)`.
    - `evidence` → `readEvidenceBlob` + `decodeImage`.
    - `live-camera` → error `"This tool needs a photo."`.
  - **`ImageToolShell`:**
    - A title plate `"<TOOL NAME> · EXH·nnn"` (exhibit number from `store.exhibitNumbers`), plus `DEMO` when the source has the `demo` tag.
    - A source screen (canvas scaled to fit, overlay drawn on top), the panels in a column, and a close key with `data-testid="tool-close"`.
  - **`ExhibitPicker`:** lists `pickableEvidence(all, ["image"])` minus `excludeId`, plus a file key using `addEvidenceFiles`.
  - **Board wiring:** add the icons and the `icon` plumbing.
- [ ] **Step 6: Run** `npx tsc --noEmit && npx vitest run`. Expected: clean, all pass.
- [ ] **Step 7: Commit** `feat(imagekit): decode, pinning, tool shell, exhibit picker and tool icons`

### Task 3: Metadata reader (EXIF, XMP, PNG, WebP)

**Files:**
- Create: `src/tools/photo/metadata.ts`
- Test: `tests/unit/metadata.test.ts`, `tests/unit/helpers/imageBytes.ts`

**Interfaces:**
- Consumes: `FindingDetail`
- Produces:
  - `interface PhotoMetadata { format: "jpeg" | "png" | "webp" | "other"; orientation?: number; make?: string; model?: string; software?: string; dateTimeOriginal?: string; offsetTimeOriginal?: string; gps?: { lat: number; lon: number; altitudeM?: number }; xmp?: { creatorTool?: string; modifyDate?: string; history: string[] }; text: Record<string, string>; warnings: string[] }`
  - `readMetadata(bytes: Uint8Array): PhotoMetadata`
  - `metadataFinding(m: PhotoMetadata): { title: string; body: string; detail?: FindingDetail }`
  - Plan 4 uses `dateTimeOriginal` and `offsetTimeOriginal`.

- [ ] **Step 1: Write the test helper** `tests/unit/helpers/imageBytes.ts`:
  - `tiff(endian: "II" | "MM", ifds: { ifd0?: Entry[]; exif?: Entry[]; gps?: Entry[] }): Uint8Array`, where `Entry = { tag: number; type: 2 | 3 | 4 | 5; value: string | number | number[] }`. Type 5 values are `[num, den]` pairs, flattened.
  - `jpeg(...segments: Array<{ marker: number; body: Uint8Array }>): Uint8Array`: SOI, the segments, a 1×1 SOF0, EOI.
  - `exifSegment(tiffBytes)`: APP1, `"Exif\0\0"` prefix.
  - `xmpSegment(xml)`: APP1, `"http://ns.adobe.com/xap/1.0/\0"`.
  - `png(chunks: Array<{ type: string; data: Uint8Array }>)`: correct CRC-32.
  - `webp(chunks)`: RIFF/WEBP.
- [ ] **Step 2: Write the failing tests** in `tests/unit/metadata.test.ts`:
  - For both `"II"` and `"MM"`:
    - `Make "Belfry Cam"`, `Model "BX-1"`, `Software "GIMP 2.10"`, `Orientation 6`
    - Exif IFD: `DateTimeOriginal "2026:06:21 15:00:00"` and `OffsetTimeOriginal "+01:00"`
    - All are read back exactly, and `format` is `"jpeg"`.
  - GPS:
    - Input: `GPSLatitudeRef "N"`, latitude `[[51,1],[30,1],[432,100]]`, `GPSLongitudeRef "W"`, longitude `[[0,1],[7,1],[2856,100]]`.
    - Expected: `lat` 51.5012 and `lon` −0.1246 (toBeCloseTo, 4).
    - `metadataFinding` gives `detail` `{ kind: "location", lat ≈ 51.5012, lon ≈ −0.1246 }`.
  - XMP:
    - Input: a packet with `xmp:CreatorTool="Adobe Photoshop 25.0"`, `xmp:ModifyDate="2026-06-22T09:00:00"` and two `stEvt:softwareAgent` values.
    - Expected: `xmp.creatorTool`, `xmp.modifyDate` and `xmp.history` has length 2.
  - `metadataFinding` body contains `"Edited with: GIMP 2.10, Adobe Photoshop 25.0"`. No verdict words.
  - PNG `tEXt` `Software\0Belfry test` → `text.Software === "Belfry test"`, `format: "png"`. PNG `eXIf` with Make → `make` is read.
  - WebP with an `EXIF` chunk → `make` is read, `format: "webp"`.
  - Nothing found → title `"Metadata: none found"`, with body `"No EXIF, XMP or text chunks. Many apps strip metadata on export, so its absence says little."`.
  - Review Focus 4:
    - An IFD entry whose offset is past the end → no throw; the field is missing, and `warnings` has one entry.
    - An IFD0 next-pointer pointing back to IFD0 → it returns.
    - The file truncated halfway through APP1 → returns `format: "jpeg"` plus a warning.
- [ ] **Step 3: Run** `npx vitest run tests/unit/metadata.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `readMetadata`.
  - Walk the JPEG markers until SOS; PNG chunks until IEND; WebP RIFF chunks.
  - TIFF: honour the byte order. Follow the ExifIFD (0x8769) and GPSIFD (0x8825) pointers. Keep a visited-offset set, and cap at 1,000 entries.
  - XMP is read with regexes for attributes and elements (no DOMParser in workers or Node).
  - The finding title is `"Metadata: N fields"`. The body lists each field as `Label: value`. Software and the XMP tools are joined into the `Edited with:` line. A GPS position gives a `location` detail.
- [ ] **Step 5: Run** the same command. Expected: PASS.
- [ ] **Step 6: Commit** `feat(photo): EXIF, XMP, PNG and WebP metadata reader`

### Task 4: JPEG quantization tables, quality and double quantization

**Files:**
- Create: `src/platform/math/dct8.ts`, `src/tools/photo/jpeg.ts`, `src/tools/photo/doubleQuant.ts`
- Test: `tests/unit/jpeg.test.ts`

**Interfaces:**
- Consumes: Task 3's helper `jpeg()` (segment building)
- Produces:
  - `dct8x8(block: Float64Array): Float64Array` and `idct8x8(coeffs: Float64Array): Float64Array`: orthonormal type-II, row-major 64.
  - `ZIGZAG: readonly number[]`: zigzag index → natural index.
  - `interface JpegInfo { width: number; height: number; progressive: boolean; tables: Map<number, Uint16Array> }`: tables in natural order.
  - `readJpeg(bytes: Uint8Array): JpegInfo | null`
  - `IJG_LUMA: readonly number[]`: the standard Annex K luminance table, natural order.
  - `ijgTable(base: readonly number[], quality: number): Uint16Array`
  - `estimateQuality(luma: Uint16Array): { quality: number; ijg: boolean }`
  - `dqScoreFromHistograms(hists: number[][]): number | null`
  - `dqScore(gray: Float32Array, w: number, h: number, luma: Uint16Array): number | null`
  - `jpegFinding(info: JpegInfo, dq: number | null): { quality: { title: string; body: string; detail: FindingDetail }; dq: { title: string; body: string; detail?: FindingDetail } }`

- [ ] **Step 1: Write the failing tests** in `tests/unit/jpeg.test.ts`:
  - **DCT:**
    - A constant block of 100s → DC 800, all AC < 1e-9.
    - `idct8x8(dct8x8(x))` returns a seeded random block within 1e-9.
  - **IJG scaling:**
    - `ijgTable(IJG_LUMA, 50)` equals `IJG_LUMA`.
    - `ijgTable(IJG_LUMA, 90)[0] === 3` and `ijgTable(IJG_LUMA, 10)[0] === 80`.
    - At quality 100, every entry is 1.
  - **Round trip:** for q = 10…95, `estimateQuality(ijgTable(IJG_LUMA, q))` is within ±1 of q, with `ijg: true`. A table of all 7s gives `ijg: false`.
  - **`readJpeg`:**
    - A JPEG built with a DQT holding `ijgTable(IJG_LUMA, 75)` in zigzag order → `tables.get(0)` equals it in natural order. `progressive` is false for SOF0 and true for SOF2.
    - Review Focus 3: `readJpeg` of PNG bytes → `null`.
  - **Double quantization** (seeded Laplacian coefficients, scale 12, 20,000 per coefficient, 9 coefficients):
    - single: `round(c/5)` histograms → score < 0.30
    - double: `round(round(c/7)*7/5)` → score > 0.50
    - `round(round(c/13)*13/5)` → score > 0.50
    - 50 samples per coefficient → `null`
  - **`jpegFinding`:**
    - Quality 87, IJG → title `"JPEG quality: about 87"`, with detail `{ kind: "measurement", value: 87, unit: "quality", uncertainty: 1 }`.
    - Non-IJG tables → title `"JPEG quality: non-standard tables"`, with no uncertainty and `value: null`.
    - DQ 0.62 → title `"Double quantization: consistent with two JPEG saves"`, and the body ends with the spec §7 sentence.
- [ ] **Step 2: Run** `npx vitest run tests/unit/jpeg.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `ijgTable`: scale = q < 50 ? 5000/q : 200 − 2q, and entry = clamp(⌊(base·scale + 50)/100⌋, 1, 255).
  - `estimateQuality`: the q in 1…100 minimising Σ|table − ijgTable(q)|. `ijg` is true when that minimum is ≤ 64.
  - `dqScoreFromHistograms`, per histogram h(n) for n ≥ 0:
    1. trend(n) = mean of h(n−2…n+2), clipped at the ends.
    2. Use n = 1…min(32, the last n with trend ≥ 20).
    3. Skip a histogram with fewer than 5 usable bins.
    4. r(n) = h(n)/trend(n) − 1, and the histogram's score is the standard deviation of r.
    5. Return the median over the usable histograms, clamped to [0, 1], or `null` when none are usable.
  - `dqScore`: blockwise DCT of gray − 128 on the 8-px grid from (0, 0). For zigzag positions 1–9, histogram `round(|c| / q2)`, where q2 is the luma table entry.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(photo): JPEG tables, quality estimate and double-quantization score`

### Task 5: ELA and noise residual

**Files:**
- Create: `src/tools/photo/ela.ts`, `src/tools/photo/noise.ts`
- Test: `tests/unit/elaNoise.test.ts`

**Interfaces:**
- Consumes: Task 1 `Pixels`, `toGray`, `mulberry32`
- Produces:
  - `ELA_QUALITY = 0.9`, `ELA_GAIN = 20`
  - `elaMap(original: Pixels, resaved: Pixels): Float32Array`
  - `noiseResidual(gray: Float32Array, w: number, h: number): Float32Array`
  - `blockSigma(residual: Float32Array, w: number, h: number, block?: number): { sigma: Float32Array; bw: number; bh: number }` (block defaults to 16)
  - `noiseInconsistency(sigma: Float32Array): number | null`
  - `noiseMap(gray: Float32Array, w: number, h: number): Float32Array`: per pixel, its block's σ ÷ the median block σ.

- [ ] **Step 1: Write the failing tests:**
  - **ELA:**
    - Identical images → all zeros.
    - One pixel differing by (3, 1, 0) → 60 there.
    - A difference of 20 → clipped to 255.
  - **Noise residual and block σ** (seeded synthetic 256×256, Gaussian noise σ = 4, with a 64×64 patch at (96, 96) of σ = 12):
    - Inside the patch, the mean block σ is 3× the mean outside, ±25%.
    - `noiseInconsistency` is higher than for the same image without the patch.
  - **Review Focus 5:**
    - A constant 64×64 image → residual all 0, and `noiseInconsistency` is `null` (σ median 0).
    - A 4×4 image → `blockSigma` gives `bw = bh = 0`, and `noiseInconsistency` is `null`.
    - No output contains `NaN`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/elaNoise.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The median is 3×3 with replicated edges.
  - σ is computed over full blocks only.
  - `noiseInconsistency` is the coefficient of variation of the finite block σ values. It is `null` with fewer than 4 blocks or a median σ of 0.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(photo): error level analysis and noise residual maps`

### Task 6: Copy-move detection (worker op)

**Files:**
- Create: `src/tools/photo/copyMove.ts`
- Modify: `src/platform/workers/ops.ts` (add `copyMove`)
- Test: `tests/unit/copyMove.test.ts`

**Interfaces:**
- Consumes: Task 1 `mulberry32`, `downscale`, `toGray`. The pool's `handleRequest` and `runOp`.
- Produces:
  - `interface CopyMoveResult { width: number; height: number; shift: { dx: number; dy: number } | null; blocks: number; mask: Uint8Array }`
  - `detectCopyMove(gray: Float32Array, w: number, h: number): CopyMoveResult`
  - The `ops.copyMove(p: { gray: Float32Array; width: number; height: number }): CopyMoveResult` op
  - `copyMoveFinding(r: CopyMoveResult): { title: string; body: string; detail: FindingDetail }`

- [ ] **Step 1: Write the failing tests:**
  - Seeded texture 256×256 (white noise box-blurred 3×3, ×4 contrast) with the 48×48 region at (40, 60) copied to (136, 100):
    - `shift` equals `{ dx: 96, dy: 40 }` and `blocks ≥ 40`.
    - `mask` covers ≥ 80% of both the source and destination regions.
  - The same texture uncopied → `blocks < 15`.
  - Review Focus 5:
    - A flat 64×64 image → `blocks === 0` and `shift === null`.
    - An 8×8 image → `blocks === 0`.
  - `handleRequest(ops, { id: 1, op: "copyMove", payload })` returns `ok: true` with the same shift.
  - `copyMoveFinding` with 52 blocks → title `"Copy-move: consistent with cloned regions"` and detail `{ kind: "measurement", value: 52, unit: "matching blocks" }`. With 20 blocks → `"Copy-move: inconclusive"`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/copyMove.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `detectCopyMove`:
  1. For every 8×8 block at stride 1 with variance ≥ 25, compute the first 9 zigzag DCT coefficients directly (each as a 64-term sum, not a full DCT), quantized as `round(c / 2.5)`.
  2. Sort the blocks lexicographically by feature.
  3. For each block, compare the next 10 in sorted order. When the features are equal and |shift| ≥ 16, count the shift, normalised so dx > 0, or dx = 0 and dy > 0.
  4. The best shift wins. Its matched blocks (source and destination) set the mask.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(photo): copy-move block matching as a worker op`

### Task 7: The demo photo

**Files:**
- Create: `src/tools/photo/demo.ts`
- Test: `tests/unit/photoDemo.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers, Task 6 `detectCopyMove`, Task 2 `encodeImage` / `decodeImage`
- Produces:
  - `forensicsDemoPixels(seed?: number): { pixels: Pixels; cloned: { x: number; y: number; w: number; h: number; dx: number; dy: number }; pasted: { x: number; y: number; w: number; h: number } }`: 512×384, seed default 7, `dx: 96, dy: 40`.
  - `makeForensicsDemo(): Promise<{ bytes: Uint8Array; mime: "image/jpeg"; title: "Demo photo — bell tower" }>` (browser)

- [ ] **Step 1: Write the failing tests:**
  - `forensicsDemoPixels()` twice gives identical `pixels.data` (`toEqual`).
  - `detectCopyMove(toGray(pixels), 512, 384)` finds `{ dx: 96, dy: 40 }` with ≥ 40 blocks.
  - The pasted rectangle doesn't overlap the cloned source or destination.
- [ ] **Step 2: Run** `npx vitest run tests/unit/photoDemo.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the pure scene:**
  - A sky gradient, a seeded stone texture, and a tower silhouette.
  - The cloned region is a 64×64 textured patch at (120, 200), copied by (96, 40).
  - The pasted rectangle is a 72×72 region at (40, 60).
- [ ] **Step 4: Implement** `makeForensicsDemo` (browser):
  1. Encode the pasted region at quality 0.6, decode it, and write it back in.
  2. Encode the whole image at quality 0.9.
- [ ] **Step 5: Run** the same command. Expected: PASS.
- [ ] **Step 6: Commit** `feat(photo): seeded demo photo with a clone and a pasted patch`

### Task 8: Photo forensics view, manifest and board loop

**Files:**
- Create:
  - `src/tools/photo/manifest.ts`
  - `src/tools/photo/PhotoForensicsView.tsx`
  - `src/tools/photo/photo.css`
  - `tests/e2e/photo.spec.ts`
- Modify:
  - `src/main.tsx` (`registerTool(photoManifest)`)
  - `src/tools/roadmap.ts` (remove `photo-forensics` from `PLANNED_TOOLS`)
  - `docs/manual-checklist.md` (a "Photo forensics" section: a real phone JPEG, a screenshot and a Photoshop-edited JPEG)
  - `docs/next-steps.md` (tick Photo forensics)

**Interfaces:**
- Consumes: Tasks 2–7, plus `runOp("copyMove", …)` and `ToolContext`.
- Produces: `photoManifest: ToolManifest` with `{ id: "photo-forensics", name: "Photo forensics", blurb: "Metadata, JPEG quantization, error levels, noise and clone detection", accepts: ["image"], demo: { label: "Run the demo photo" }, icon: "forensics" }`.

- [ ] **Step 1: Run `/impeccable shape photo-forensics`.** Record the layout decisions in `.impeccable/surfaces/src-tools-photo.md`.
- [ ] **Step 2: Write the failing e2e test** `tests/e2e/photo.spec.ts` (`skipDemo`, `collectErrors`):
  - **`"demo photo: every panel reads out, and pinned results link back to the photo"`:**
    1. Create a case, click `open-tool-photo-forensics`, check that `no-signal` is visible, click `run-demo`.
    2. `panel-copy-move` contains `"consistent with cloned regions"` (timeout 20 s).
    3. `panel-jpeg` matches `/about (89|90|91)/` (the estimate is ±1). `panel-ela` and `panel-noise` each show a canvas whose `width × height` equals the decoded 512 × 384 (Review Focus 2).
    4. Click `pin-copy-move` and `pin-ela`, then `tool-close`.
    5. The board has 5 cards (demo photo, 2 maps, 2 findings) and 4 `.react-flow__edge.link-derived-from`.
    6. No console errors.
  - **`"a PNG says the JPEG tests don't apply and shows no NaN"`:**
    1. Open the tool on `pick` and `setInputFiles` on `no-signal-file-input` with the 1×1 PNG (base64 `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==`).
    2. `panel-jpeg` contains `"Not a JPEG: quantization tests don't apply."`.
    3. `panel-copy-move` contains `"inconclusive"`.
    4. The page text doesn't contain `"NaN"` (Review Focus 3 and 5).
- [ ] **Step 3: Run** `npx playwright test tests/e2e/photo.spec.ts`. Expected: FAIL (no such tool).
- [ ] **Step 4: Implement the view.**
  - Wrap it in `useToolImage(ctx, makeForensicsDemo)` → `ImageToolShell`.
  - Five `ToolPanel`s: `metadata`, `jpeg`, `ela`, `noise`, `copy-move`.
  - Each computes once the pixels are ready; copy-move goes through `runOp` on a ≤512 px gray copy, and its mask is scaled back up for the overlay.
  - Each panel's pin calls `pinResult`:
    - The maps are encoded as PNG through `heatmapPixels` + `encodeImage`.
    - Titles come from Tasks 3–6, and bodies end with the §7 limit sentence.
    - ELA and noise findings carry no verdict. The ELA finding is titled `"Error levels: map"`, and the noise finding `"Noise residual: map"` with the inconsistency `measurement` (unit `σ spread`).
  - Register the manifest and remove the roadmap entry.
- [ ] **Step 5: Run** `npx playwright test tests/e2e/photo.spec.ts`. Expected: PASS.
- [ ] **Step 6: Run** `npx tsc --noEmit && npx vitest run && npx playwright test`. Expected: all pass.
- [ ] **Step 7: Run `/impeccable critique src/tools/photo`.** Fix P0/P1 findings and re-run Step 6.
- [ ] **Step 8: Commit** `feat(photo): photo forensics tool with pinned maps and findings`
