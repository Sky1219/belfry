# Steganography Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide and recover messages with sequential LSB, and detect hidden payloads with the chi-square attack and RS steganalysis. Results are pinned to the board.

**Architecture:**
- Pure modules in `src/tools/stego/`: `lsb.ts` (format), `stats.ts` (the chi-square CDF and attack) and `rs.ts` (RS steganalysis). They are unit-tested on a seeded synthetic cover.
- The view has two modes, Analyse and Embed, built on plan 1's image kit.
- Embedding always outputs PNG.

**Tech Stack:** TypeScript 5, React 19, Vitest 3, Playwright 1.56. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-image-forensics-design.md` (§1, §5, §7)

**Depends on:** plan 1, Tasks 1–2: `Pixels`, `makePixels`, `mulberry32`, `verdictFor`, `verdictTitle`, `pinResult`, `useToolImage`, `ImageToolShell`, `ToolPanel`, `encodeImage`, and the `stego` icon.

## Global Constraints

- Tool id `stego-lab`. `accepts: ["image"]`. Demo label `"Run the demo image"`. Icon `stego`.
- The format:
  - Sequential LSB over R, G, B, row-major. Alpha is untouched, and pixels with alpha < 255 are skipped.
  - The header is the bytes `0x42 0x4C 0x46 0x59` (`BLFY`), then the payload length as a uint32 big-endian, then the UTF-8 payload.
  - "Needs N bytes" counts 8 + payload bytes.
- Capacity error, verbatim: `That message needs N bytes; this image holds M.`
- Embedding outputs `image/png` only, never JPEG.
- The chi-square attack runs at k = 10%, 20% … 100% of the opaque channel stream.
- Verdicts:
  - consistent: chi-square p ≥ 0.95 at k = 100%, or RS p̂ ≥ 0.10
  - inconclusive: p ≥ 0.50 or p̂ ≥ 0.05
  - The test name is `"Hidden data"` and the subject `"sequential LSB embedding"`.
- Limit sentence, verbatim: `Only detects sequential LSB embedding. Absence of a signal isn't proof of a clean image.`
- Demo message, verbatim: `The bell was stopped at 04:10 from the east bracket.`
- Every screen is a `Bezel`. Run `/impeccable shape stego-lab` before Task 4 and `/impeccable critique src/tools/stego` after it.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A transparent PNG (logo, sticker):** embed and extract skip pixels that aren't opaque, so the message survives a canvas round trip. Pinned in Task 1.
2. **Embedding into a JPEG source:** the output is PNG, and the panel says so. Pinned in Task 4.
3. **A message that exactly fills the capacity, and one byte more:** the first works, the second gives the exact capacity error. Pinned in Task 1.
4. **Non-ASCII messages (accents, emoji):** round-trip byte-exact, and the capacity counts UTF-8 bytes, not characters. Pinned in Task 1.
5. **A random-noise image that isn't a stego image:** extract returns `null` rather than garbage, even when the length field would be plausible. Pinned in Task 1.

---

### Task 1: LSB format: capacity, embed, extract

**Files:**
- Create: `src/tools/stego/lsb.ts`
- Test: `tests/unit/lsb.test.ts`

**Interfaces:**
- Produces:
  - `MAGIC = Uint8Array.of(0x42, 0x4c, 0x46, 0x59)`
  - `capacityBytes(p: Pixels): number`: ⌊opaque pixels × 3 / 8⌋ − 8, floored at 0
  - `class CapacityError extends Error { needed: number; capacity: number }`
  - `embed(p: Pixels, message: string): Pixels` (a new copy)
  - `extract(p: Pixels): string | null`
  - `syntheticCover(seed: number, w?: number, h?: number): Pixels`: 256×256 by default. A smooth seeded scene with Gaussian noise σ = 2, then a contrast stretch `round((v − 128) × 1.3 + 128)` clamped to 0–255 (this leaves a comb-like histogram). Shared with Tasks 2–3.
  - `randomEmbed(p: Pixels, rate: number, seed: number): Pixels`: replaces the LSBs of the first `rate` share of the opaque channel stream with seeded random bits. A test and demo helper.

- [ ] **Step 1: Write the failing tests:**
  - `extract(embed(cover, DEMO_MESSAGE))` returns `DEMO_MESSAGE`.
  - `"Glocke — 04:10 ✓"` round-trips. `capacityBytes` accounting uses `new TextEncoder().encode(msg).length` (Review Focus 4).
  - Alpha bytes are unchanged after `embed`.
  - A cover whose left half has alpha 0 → the left-half RGB bytes are unchanged, and the message still round-trips (Review Focus 1).
  - Review Focus 3:
    - A 16×16 opaque image has capacity ⌊768/8⌋ − 8 = 88. An 88-byte ASCII message embeds.
    - An 89-byte message throws `CapacityError` with message `"That message needs 97 bytes; this image holds 88."`.
  - Review Focus 5:
    - `extract(syntheticCover(5))` → `null`.
    - An image whose first 32 LSBs spell `BLFY` but whose length field is larger than the capacity → `null`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/lsb.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Bits are written MSB-first per byte, in the R, G, B order of opaque pixels only.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(stego): sequential LSB format with capacity checks`

### Task 2: Chi-square CDF and the Westfeld–Pfitzmann attack

**Files:**
- Create: `src/tools/stego/stats.ts`
- Test: `tests/unit/chiSquare.test.ts`

**Interfaces:**
- Consumes: Task 1 `syntheticCover`, `randomEmbed`
- Produces:
  - `gammaP(a: number, x: number): number`: the regularised lower incomplete gamma.
  - `chi2cdf(x: number, df: number): number`
  - `chiSquareAttack(p: Pixels, steps?: number): Array<{ fraction: number; p: number }>`. `steps` defaults to 10, giving fractions 0.1 … 1.0.

- [ ] **Step 1: Write the failing tests:**
  - `chi2cdf(3.841459, 1)` ≈ 0.95 (1e-4); `chi2cdf(18.307, 10)` ≈ 0.95 (1e-4); `chi2cdf(0, 5) === 0`; `chi2cdf(1e6, 5)` ≈ 1.
  - `chiSquareAttack(syntheticCover(5))` → `p < 0.05` at fraction 1.0.
  - `chiSquareAttack(randomEmbed(cover, 1.0, 9))` → `p > 0.95` at every fraction.
  - `randomEmbed(cover, 0.5, 9)` → `p > 0.95` at fractions ≤ 0.4, and `p < 0.5` at 1.0.
- [ ] **Step 2: Run** `npx vitest run tests/unit/chiSquare.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `gammaP` uses a series for x < a + 1 and a continued fraction otherwise (Numerical Recipes `gser`/`gcf`), with 1e-12 tolerance.
  - The attack: take the value histogram of the first fraction of the opaque channel stream. For each pair (2i, 2i+1), the expected count is their mean; pairs with an expected count ≤ 4 are skipped. X² = Σ (h₂ᵢ − expected)² / expected, df = pairs used − 1, and p = 1 − chi2cdf(X², df).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(stego): chi-square CDF and pairs-of-values attack`

### Task 3: RS steganalysis and the finding

**Files:**
- Create: `src/tools/stego/rs.ts`, `src/tools/stego/finding.ts`
- Test: `tests/unit/rs.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; plan 1 `verdictFor`, `verdictTitle`.
- Produces:
  - `rsAnalysis(p: Pixels): { rate: number | null }`: estimated embedded share of the capacity, clamped to [0, 1].
  - `stegoFinding(r: { payload: string | null; chi: Array<{ fraction: number; p: number }>; rs: { rate: number | null } }): { title: string; body: string; detail?: FindingDetail }`

- [ ] **Step 1: Write the failing tests:**
  - On `syntheticCover(5)`: `rate < 0.05`.
  - On `randomEmbed(cover, 0.5, 9)`: rate 0.5 ± 0.1. On `randomEmbed(cover, 1.0, 9)`: rate ≥ 0.85.
  - A 1×4 image → `rate === null`, never NaN.
  - `stegoFinding`:
    - With a payload → title `"Hidden data: LSB payload found"`, detail `{ kind: "decode", scheme: "LSB", text: payload }`.
    - Without a payload, chi-square p 0.99 at 1.0 → title `"Hidden data: consistent with sequential LSB embedding"`, detail `{ kind: "measurement", value: rate, unit: "of capacity", uncertainty: 0.05 }`.
    - The clean cover → `"Hidden data: no sign of sequential LSB embedding"`.
    - The body always ends with the limit sentence.
- [ ] **Step 2: Run** `npx vitest run tests/unit/rs.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** RS per channel over row-wise groups of 4 opaque values, mask [0, 1, 1, 0], discrimination f = Σ|xᵢ₊₁ − xᵢ|:
  1. F₁ swaps 2n ↔ 2n+1, and F₋₁ swaps 2n−1 ↔ 2n.
  2. Measure Rₘ, Sₘ, R₋ₘ and S₋ₘ as fractions of groups, on the image and on the image with every LSB flipped.
  3. With d₀ = Rₘ − Sₘ and d₁ = Rₘ' − Sₘ' (flipped), and d₋₀, d₋₁ likewise, solve 2(d₁ + d₀)x² + (d₋₀ − d₋₁ − d₁ − 3d₀)x + (d₀ − d₋₀) = 0.
  4. Take the root of smaller magnitude: p̂ = x / (x − ½). Average the three channels.
  5. Return `null` when there are fewer than 64 groups, or the discriminant is negative.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(stego): RS steganalysis and finding copy`

### Task 4: Steganography lab view and board loop

**Files:**
- Create:
  - `src/tools/stego/manifest.ts`
  - `src/tools/stego/StegoView.tsx`
  - `src/tools/stego/demo.ts`
  - `src/tools/stego/stego.css`
  - `tests/e2e/stego.spec.ts`
- Modify:
  - `src/main.tsx` (register)
  - `docs/manual-checklist.md` (a "Steganography lab" section: embed, download the PNG, re-add it; then re-save it as JPEG and confirm that the payload is gone)
  - `docs/next-steps.md`

**Interfaces:**
- Consumes: Tasks 1–3 and plan 1's kit.
- Produces:
  - `stegoManifest` with `{ id: "stego-lab", name: "Steganography lab", blurb: "Hide a message in a photo, or test one for hidden data", accepts: ["image"], demo: { label: "Run the demo image" }, icon: "stego" }`
  - `makeStegoDemo(): Promise<{ bytes: Uint8Array; mime: "image/png"; title: "Demo image — harbour" }>`: `embed(syntheticCover(21, 512, 384), DEMO_MESSAGE)`, encoded as PNG.

- [ ] **Step 1: Run `/impeccable shape stego-lab`.**
- [ ] **Step 2: Write the failing e2e test** `tests/e2e/stego.spec.ts`:
  - **`"demo image: the hidden message is found and pinned as a decode"`:**
    1. Click `run-demo`. `panel-analyse` contains `"LSB payload found"` and the demo message.
    2. Click `pin-analyse` and close. The finding card's `finding-readout` reads `"LSB · The bell was stopped at 04:10 from the east bracket."`.
  - **`"embedding writes a PNG derived from the source, and it reads back"`:**
    1. Open the demo exhibit, switch to `mode-embed`, type `"Meet at the belfry"` into `embed-message`, and click `embed-pin`.
    2. A new image card titled `"Demo image — harbour — with hidden message"` appears, with `derived-from` its source.
    3. Open it in the tool: `panel-analyse` contains `"Meet at the belfry"`.
- [ ] **Step 3: Run** `npx playwright test tests/e2e/stego.spec.ts`. Expected: FAIL.
- [ ] **Step 4: Implement the view.**
  - Modes `mode-analyse` and `mode-embed`.
  - Analyse runs `extract`, `chiSquareAttack` and `rsAnalysis`. Draw the chi-square p against k as a 10-bar amber chart, with each bar's value in its `aria-label`. Then the verdict title and a pin.
  - Embed has a textarea (`embed-message`) and a capacity readout (`"N of M bytes"`, red when over capacity). It shows `CapacityError` text inline.
    - When the source mime is JPEG, a line reads `"Saved as PNG: a JPEG save would erase the message."` (Review Focus 2).
    - `embed-pin` → `encodeImage(…, "image/png")` → `pinResult` with an image (titled `"<source title> — with hidden message"`) and the finding `"Message hidden (LSB, N bytes)"`. The body says `"Share the PNG itself; re-saving it as JPEG destroys the message."`.
  - Register the manifest.
- [ ] **Step 5: Run** `npx playwright test tests/e2e/stego.spec.ts`. Expected: PASS.
- [ ] **Step 6: Run** `npx tsc --noEmit && npx vitest run && npx playwright test`. Expected: all pass.
- [ ] **Step 7: Run `/impeccable critique src/tools/stego`.** Fix P0/P1 findings and re-run Step 6.
- [ ] **Step 8: Commit** `feat(stego): steganography lab with analyse and embed modes`
