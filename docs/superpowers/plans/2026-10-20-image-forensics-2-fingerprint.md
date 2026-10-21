# Fingerprint Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compare two fingerprint photos. Enhance the ridges, extract minutiae, align and score them, and pin an overlay plus an honestly worded finding.

**Architecture:**
- A pure pipeline in `src/tools/fingerprint/`: synth → orientation → frequency → Gabor → thinning → minutiae → matching. It is unit-tested on seeded synthetic prints.
- Enhancement and extraction run as one `fingerprint` worker op; matching runs on the main thread.
- The view uses plan 1's image kit, with `ExhibitPicker` for the second print.

**Tech Stack:** TypeScript 5, React 19, Vitest 3, Playwright 1.56, the shared `WorkerPool`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-image-forensics-design.md` (§1, §4, §7)

**Depends on:** plan 1 (`2026-10-20-image-forensics-1-photo.md`), Tasks 1–2: `Pixels`, `toGray`, `downscale`, `mulberry32`, `verdictFor`, `verdictTitle`, `pinResult`, `pinDemoInput`, `useToolImage`, `ImageToolShell`, `ToolPanel`, `ExhibitPicker`, `encodeImage`, and the `fingerprint` icon.

## Global Constraints

- Tool id `fingerprint-lab`. `accepts: ["image"]`. Demo label `"Run the demo prints"`. Icon `fingerprint`.
- Each print is analysed as grayscale at long side 640 px.
- Pipeline values:
  - 16 px blocks; mask variance ≥ 0.1 after normalising to mean 0, variance 1
  - frequency kept in [1/25, 1/3] px⁻¹
  - Gabor σ = 4 px
  - minutiae dropped within 10 px of the mask border, and for pairs closer than 6 px
- Matching tolerance is 10 px and 20°. Score = `matched / ((n1 + n2) / 2)`.
- Verdicts:
  - consistent: score ≥ 0.40 and ≥ 12 matched
  - inconclusive: 0.25–0.39, or fewer than 12 minutiae in either print
  - The subject is `"the same finger"`, the test name `"Fingerprint match"`, and the no-sign title `"Fingerprint match: no sign of the same finger"`.
- Limit sentence, verbatim: `Hobby-grade matching of two photos. This is not an identification.`
- Notice, verbatim, shown until acknowledged: `Compare your own prints only. Prints are processed on this device and never leave it. This is not an identification.`
  - The acknowledge key reads `I'm comparing my own prints`.
  - It is stored as `fingerprintNoticeSeen: true` in this tool's settings.
- Never the words "identified", "match confirmed", "proves". Every screen is a `Bezel`. Run `/impeccable shape fingerprint-lab` before Task 5 and `/impeccable critique src/tools/fingerprint` after it.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A photo with no print in it** (a blank wall, low contrast): reads `Fingerprint match: inconclusive` with `not enough ridge detail` and no score. Pinned in Task 4.
2. **The same exhibit compared with itself:** the picker never offers the first print as the second. Pinned in Task 5 (the e2e test checks that `ExhibitPicker` excludes the source).
3. **Print B photographed upside down (rotated 180°):** still matches, because the alignment is rotation-invariant. Pinned in Task 4.
4. **The notice:** shown once per browser, not on every open after it's acknowledged, and never skipped before. Pinned in Task 5.
5. **Two identical images:** score 1.0, and the title still reads `consistent with the same finger`, never "identified". Pinned in Task 4.

---

### Task 1: Synthetic prints, normalisation, mask and orientation field

**Files:**
- Create: `src/tools/fingerprint/synth.ts`, `src/tools/fingerprint/orientation.ts`
- Test: `tests/unit/fpOrientation.test.ts`

**Interfaces:**
- Produces:
  - `interface SynthPrint { gray: Float32Array; width: number; height: number; orientationAt(x: number, y: number): number; defects: Array<{ x: number; y: number }> }`. `orientationAt` gives the ridge direction in radians, in [0, π).
  - `synthPrint(o: { seed: number; width?: number; height?: number; period?: number; rotateDeg?: number; dx?: number; dy?: number; noise?: number }): SynthPrint`. Defaults: 320×400, period 9, noise 0.15.
  - `normalize(gray: Float32Array): Float32Array`: mean 0, variance 1.
  - `segmentMask(norm: Float32Array, w: number, h: number, block?: number, minVar?: number): { mask: Uint8Array; bw: number; bh: number }`. Defaults: block 16, minVar 0.1.
  - `orientationField(norm: Float32Array, w: number, h: number, block?: number): { theta: Float32Array; coherence: Float32Array; bw: number; bh: number }`. Default block 16.

- [ ] **Step 1: Write the failing tests:**
  - `synthPrint({ seed: 3 })` twice → identical `gray`.
  - `normalize` → mean ≈ 0 and variance ≈ 1 (1e-6).
  - A print with a 32 px blank border → the border blocks have `mask = 0`, and ≥ 90% of the interior blocks have `mask = 1`.
  - Orientation: at every masked block centre, the angular error against `orientationAt` (mod π) is < 15° on ≥ 85% of blocks for noise 0.15.
- [ ] **Step 2: Run** `npx vitest run tests/unit/fpOrientation.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `synthPrint`.**
  - Phase field: ψ = 2π·ρ/period, with ρ = √((x−cx)² + (1.6(y−cy))²) plus a smooth seeded warp of amplitude 6 px. Add 30 seeded phase dislocations, ψ += atan2(y − py, x − px); each dislocation creates one minutia, recorded in `defects`.
  - Pixels: `gray = 127 + 100·cos ψ` plus Gaussian noise × 255.
  - `rotateDeg`, `dx` and `dy` transform the sampling coordinates.
  - `orientationAt` is the direction perpendicular to ∇ψ.
- [ ] **Step 4: Implement `orientationField`.**
  - Use Sobel gradients. For each block, θ = ½·atan2(2ΣGxGy, Σ(Gx² − Gy²)) + π/2.
  - Smooth with a 3×3 average over the doubled-angle vectors.
  - Coherence is |Σ(Gx² − Gy², 2GxGy)| / Σ(Gx² + Gy²).
- [ ] **Step 5: Run** the same command. Expected: PASS.
- [ ] **Step 6: Commit** `feat(fingerprint): synthetic prints, segmentation and orientation field`

### Task 2: Ridge frequency, Gabor enhancement and thinning

**Files:**
- Create: `src/tools/fingerprint/enhance.ts`, `src/tools/fingerprint/thin.ts`
- Test: `tests/unit/fpEnhance.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces:
  - `ridgeFrequency(norm: Float32Array, w: number, h: number, field: ReturnType<typeof orientationField>, mask: Uint8Array): Float32Array`: per block. 0 means unknown; known values are kept in [1/25, 1/3].
  - `gaborEnhance(norm: Float32Array, w: number, h: number, field: ReturnType<typeof orientationField>, freq: Float32Array, mask: Uint8Array): Float32Array`
  - `binarize(enh: Float32Array): Uint8Array`: 1 where > 0.
  - `zhangSuen(bin: Uint8Array, w: number, h: number): Uint8Array`

- [ ] **Step 1: Write the failing tests:**
  - On `synthPrint({ seed: 3, period: 9, noise: 0.15 })`, the median of the nonzero `ridgeFrequency` values is within 10% of 1/9.
  - The Pearson correlation of `gaborEnhance` output with the noise-free print (same seed, noise 0) is higher than the noisy input's, by ≥ 0.15.
  - `zhangSuen` on a 5-px-thick horizontal bar, columns 10–49 → for columns 14–45, exactly 1 set pixel per column. The output is a subset of the input.
  - A 1-px diagonal line is unchanged.
- [ ] **Step 2: Run** `npx vitest run tests/unit/fpEnhance.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Frequency: project a 32×16 window along the ridge normal, and take the mean distance between peaks.
  - Gabor: one even-symmetric kernel per block, 11×11, oriented along θ, with σx = σy = 4 and frequency from `ridgeFrequency`. Blocks with an unknown frequency use the median of the known ones.
  - Thinning: the standard two-subiteration Zhang–Suen algorithm.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(fingerprint): ridge frequency, Gabor enhancement and thinning`

### Task 3: Minutiae extraction and the worker op

**Files:**
- Create: `src/tools/fingerprint/minutiae.ts`, `src/tools/fingerprint/pipeline.ts`
- Modify: `src/platform/workers/ops.ts` (add `fingerprint`)
- Test: `tests/unit/fpMinutiae.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; plan 1's `downscale` and `toGray`.
- Produces:
  - `interface Minutia { x: number; y: number; angle: number; kind: "ending" | "bifurcation" }`
  - `extractMinutiae(skel: Uint8Array, w: number, h: number, mask: Uint8Array, bw: number): Minutia[]`
  - `analysePrint(gray: Float32Array, w: number, h: number): { minutiae: Minutia[]; skeleton: Uint8Array; width: number; height: number }`
  - The `ops.fingerprint(p: { gray: Float32Array; width: number; height: number })` op returns the same thing.

- [ ] **Step 1: Write the failing tests:**
  - A hand-drawn skeleton: one straight 30-px line in a fully masked 64×64 → exactly 2 endings, with angles pointing outward (to within 20°).
  - A "Y" skeleton → 1 bifurcation and 3 endings.
  - A line ending 5 px from the mask border → that ending is dropped.
  - Two endings 4 px apart → both are dropped.
  - `analysePrint` on `synthPrint({ seed: 3 })`:
    - The count is within ±50% of `defects.length`, since each dislocation gives one minutia.
    - ≥ 50% of the defects have a minutia within 8 px.
  - `handleRequest(ops, { id: 1, op: "fingerprint", payload })` → `ok: true`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/fpMinutiae.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Crossing number: CN = ½ Σ |Pᵢ − Pᵢ₊₁| over the 8 neighbours. CN = 1 is an ending, CN = 3 a bifurcation.
  - Angle: the direction from the minutia along its ridge, traced 8 px.
  - Then apply the border rule and the 6 px pair rule.
  - The pipeline: normalise → mask → orientation → frequency → Gabor → binarise → thin → extract.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(fingerprint): crossing-number minutiae and the fingerprint worker op`

### Task 4: Matching and the finding

**Files:**
- Create: `src/tools/fingerprint/match.ts`
- Test: `tests/unit/fpMatch.test.ts`

**Interfaces:**
- Consumes: Task 3 `Minutia`, `analysePrint`; plan 1 `verdictFor`, `verdictTitle`.
- Produces:
  - `matchMinutiae(a: Minutia[], b: Minutia[], tol?: { distPx: number; angleDeg: number }): { score: number; matched: number; pairs: Array<[number, number]>; transform: { theta: number; tx: number; ty: number } }`. Default tolerance 10 px / 20°.
  - `fingerprintFinding(a: Minutia[], b: Minutia[], m: ReturnType<typeof matchMinutiae>): { title: string; body: string; detail?: FindingDetail }`

- [ ] **Step 1: Write the failing tests:**
  - `b` = `a` (40 seeded minutiae) rotated 15° and shifted (30, −20) exactly → `score === 1` and `matched === 40`.
  - `b` = `a` rotated 180° (Review Focus 3) → `score === 1`.
  - 20% of `b` dropped and 2 px jitter → `score ≥ 0.6`.
  - Two unrelated seeded sets of 40 → `score ≤ 0.2`.
  - The pipeline on the demo pair (`synthPrint({ seed: 3 })` against `synthPrint({ seed: 3, rotateDeg: 15, dx: 30, dy: -20 })`) → `score ≥ 0.40` and `matched ≥ 12`. Seed 3 against seed 11 → `score < 0.25`.
  - `fingerprintFinding`:
    - Score 0.52 with 18 matched → title `"Fingerprint match: consistent with the same finger"`, detail `{ kind: "measurement", value: 0.52, unit: "match score" }`. The body ends with the limit sentence.
    - Identical inputs (score 1) → the same title (Review Focus 5).
    - 8 minutiae in one print → title `"Fingerprint match: inconclusive"`, the body contains `"not enough ridge detail"`, and there's no `detail` (Review Focus 1).
- [ ] **Step 2: Run** `npx vitest run tests/unit/fpMatch.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - For every pair (i in a, j in b), the alignment is θ = angleⱼ − angleᵢ, translating aᵢ onto bⱼ.
  - Count the a minutiae that land within the tolerance of an unused b minutia, using a 10 px grid hash over b.
  - Keep the best alignment, then greedily take the one-to-one pairs.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(fingerprint): rotation-invariant minutiae matching and finding copy`

### Task 5: Fingerprint lab view and board loop

**Files:**
- Create:
  - `src/tools/fingerprint/manifest.ts`
  - `src/tools/fingerprint/FingerprintView.tsx`
  - `src/tools/fingerprint/demo.ts`
  - `src/tools/fingerprint/fingerprint.css`
  - `tests/e2e/fingerprint.spec.ts`
- Modify:
  - `src/main.tsx` (register)
  - `docs/manual-checklist.md` (a "Fingerprint lab" section: two photos of your own finger, then different fingers)
  - `docs/next-steps.md`

**Interfaces:**
- Consumes: Tasks 1–4; plan 1's kit; `runOp("fingerprint", …)`; `getToolSettings` / `setToolSettings`.
- Produces:
  - `fingerprintManifest` with `{ id: "fingerprint-lab", name: "Fingerprint lab", blurb: "Ridge enhancement, minutiae and a match score for two prints", accepts: ["image"], demo: { label: "Run the demo prints" }, icon: "fingerprint" }`
  - `makeFingerprintDemo(): Promise<{ a: DemoImage; b: DemoImage }>`, where each `DemoImage` is `{ bytes: Uint8Array; mime: "image/png"; title: string }`. The titles are `"Demo print A"` and `"Demo print B"`.
    - The view's `makeDemo` for `useToolImage` calls it, pins B with `pinDemoInput`, and returns A with `meta: { pairWith: <B's exhibit id> }`.
    - When the source has `meta.pairWith`, the view picks that exhibit as print B without asking.

- [ ] **Step 1: Run `/impeccable shape fingerprint-lab`.**
- [ ] **Step 2: Write the failing e2e test** `tests/e2e/fingerprint.spec.ts` (`skipDemo`, `collectErrors`):
  - **`"notice once, demo prints match, result pins with an overlay"`:**
    1. Create a case and click `open-tool-fingerprint-lab`. `fp-notice` contains the notice text; click `fp-notice-ack`.
    2. Click `run-demo`. `panel-match` contains `"consistent with the same finger"` (timeout 30 s).
    3. Click `pin-match`, then `tool-close`.
    4. The board has 4 cards (prints A and B, the overlay, the finding), and the finding card shows `finding-readout` matching `/^0\.\d\d match score$/`.
    5. Reopen the tool from the rack: `fp-notice` is absent (Review Focus 4).
  - **`"the second-print picker never offers the first print"`:**
    1. Open the tool on demo print A with `ev:<id>`.
    2. The `exhibit-picker` list has no row whose text is `"Demo print A"` (Review Focus 2).
- [ ] **Step 3: Run** `npx playwright test tests/e2e/fingerprint.spec.ts`. Expected: FAIL.
- [ ] **Step 4: Implement the view.**
  - The notice gate comes first: a `Bezel` with `data-testid="fp-notice"`, the ack key `fp-notice-ack`, and the setting persisted.
  - The source is print A. Print B is chosen through `ExhibitPicker` with `excludeId` set to A, or comes from `meta.pairWith`.
  - Run `runOp("fingerprint")` on both prints, then `matchMinutiae`.
  - The panel `match` shows the score readout and the verdict title.
  - The overlay image: both skeleton-enhanced prints side by side, matched pairs joined by amber (`#ffa733`) lines, minutiae as small squares. It is encoded as PNG.
  - Pin through `pinResult` with `source` set to print A; the finding's `meta.prints` holds `[aId, bId]`. Then add a second link, finding → print B, `derived-from`.
  - Register the manifest.
- [ ] **Step 5: Run** `npx playwright test tests/e2e/fingerprint.spec.ts`. Expected: PASS.
- [ ] **Step 6: Run** `npx tsc --noEmit && npx vitest run && npx playwright test`. Expected: all pass.
- [ ] **Step 7: Run `/impeccable critique src/tools/fingerprint`.** Fix P0/P1 findings and re-run Step 6.
- [ ] **Step 8: Commit** `feat(fingerprint): fingerprint lab with notice, picker and pinned overlay`
