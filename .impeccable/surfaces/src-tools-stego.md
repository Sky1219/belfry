---
version: 1
slug: "src-tools-stego"
primary_target: "src/tools/stego"
related_targets: ["src/tools/imagekit"]
---

# Surface brief: Steganography lab

Scope: the Steganography lab tool screen (src/tools/stego), sitting in the image kit frame (src/tools/imagekit: title plate, Source screen, panel column). Visitor mode: Operate. Inside the established Monitor Wall world (DESIGN.md); no new visual world.

Shaped 2026-10-21 without a live interview: the shape ran inside an automated build task with no structured question tool and no human on the line, so every decision below is the reasonable DESIGN.md-consistent choice, open to one correction round.

## Job and audience

- The developer testing their own photos for a hidden message, or hiding one to share; and cold visitors who press "Run the demo image" from No Signal. They want to know whether a photo carries a Belfry LSB message (and read it), how strongly the two detectors say "something is in the low bits", and to hide a message of their own that survives being passed around.
- Success, Analyse: the panel says in the finding's own words whether a message was found, shows it, shows the chi-square curve and the RS estimate, and pins the finding. Success, Embed: a typed message fits, is hidden, and lands on the board as a new PNG exhibit derived from the source, with a finding saying how to share it; reopened in the lab, it reads back.

## Outcome and proof

- One verdict test (Hidden data) and one action (embed). Every analyse title, body and readout comes from `stegoFinding` (verdict "payload" | "consistent" | "inconclusive" | "no-sign"); the view never parses titles. Numbers are the finding's 2 dp values (Ruling P3-R1); the chart's bars use the same rounding.
- Honesty is the product truth: the body ends with the limit sentence, verbatim, "Only detects sequential LSB embedding. Absence of a signal isn't proof of a clean image." The panel adds no claim beyond it. In particular no copy says RS "proves" or "confirms" anything, and nothing promises a reading on flat graphics, screenshots or logos (RS reads two-level graphics close to the line).
- A JPEG save destroys the payload: the embed output is always PNG, and a JPEG source says so before you embed.

## Selected direction

- Visual authority: DESIGN.md as shipped. The Monitor Rule (mode, analyse and embed are each a Bezel), Two Lights, Lamp Rule, Three Voices, Next Step Rule.
- Layout: the image kit frame unchanged. The photo is the main screen. The right-hand column holds, in order:
  1. **Mode** (a slim bezel, lamp off): two keys, Analyse and Embed, as a mode group (`aria-pressed`, the current one engaged). Mode keys are exempt from the Next Step Rule's one-lit-key count, as Detective Vision's MODE row is.
  2. In Analyse mode, **Hidden data** (`panel-analyse`). Bezel readout: `RS 0.04` (the rounded estimate), `RS --` without one, or `53 bytes` when a message was read. Glass, top to bottom: the chi-square chart; the verdict title; for a payload, the message itself on a recessed pane in Barlow (someone wrote it; Three Voices), with its scheme `LSB` in a Label; the body; the pin key.
  3. In Embed mode, **Hide a message** (`panel-embed`). Glass: a labelled textarea well ("Message"), the capacity line in mono under it (the message's UTF-8 bytes of the payload room, `18 of 73720 bytes`; Steel Grey, Signal Red when over: an alarm), the verbatim `CapacityError` text inline as an alert when over, one body line saying what the key makes ("Pins a PNG copy of this photo with the message in its lowest bits."), the PNG line for a JPEG source, then the key "Hide and pin" (`embed-pin`). It is the surface's one lit key once a message is typed and fits (as OPEN CASE is once a name is typed); otherwise plain steel and disabled. The "Pinned" steel plate confirms each embed.
- Both modes stay mounted in state: switching keeps the typed message and never re-runs the analysis (it runs once per photo, on the worker).
- Focal moment: the chi-square chart. Ten bars, k = 10% … 100% of the opaque channel stream read, p from 0 to 1 on black glass over faint bone slots (the Readouts trace's vocabulary), each bar's value above it in 10px mono to 2 dp and its k under it. Two hairline guides mark the bands at 0.50 and 0.95, labelled at the right edge in mono, and a zero line runs under every bar so a 0.00 still reads as a reading. A one-line key under the chart says what a bar near 1 means and what the dashes are, and for a payload how much of the image's low bits the message fills (the critique of 2026-10-21 found the demo's chart read as empty beside "payload found"). At phone width the ten value labels close up to the tracking floor (a container query) so they don't run together. Bars are solid Amber only when the verdict is "payload" or "consistent" (amber marks a finding: plans 1–2 precedent, Two Lights); otherwise Steel Grey. Each bar is `role="img"` with an `aria-label` like "10% read: p 1.00"; the chart is a labelled list. A payload that fills a share of the image reads as a cliff: high bars for the share that carries it, then a drop. A short message (the demo's 52 bytes) is too small to move the bars, so they sit near 0.00 in amber: the decode, not the chart, is the finding then.

## Lamps and light

- Mode: off (controls, nothing live).
- Hidden data: pulse while the worker reads the photo; amber on "payload" or "consistent" (title in amber); off on "inconclusive" and "no sign"; amber on failure, with the reason in plain words.
- Hide a message: off; the panel is an input. It never pulses: embedding is one linear pass on the main thread, then the PNG encode (Ruling P3-R3).

## States and ranges

- Photos from 1 px to 40 MP. Analyse runs as one worker op, `stegoAnalyse`, on a copy of the pixels (transferred), aborted and dropped when the photo changes (Ruling P3-R3).
- Capacity: `capacityBytes` (opaque pixels × 3 / 8 − 8). Zero capacity (a tiny image, or a fully transparent one): the panel reads "This image is too small to hold a message." in place of the textarea, never the raw "needs 8 bytes; this image holds 0".
- Message empty: capacity line reads `0 of M bytes`, key disabled. Over capacity: capacity line red, the verbatim capacity error, key disabled. Exactly at capacity works (Review Focus 3). Non-ASCII counts UTF-8 bytes (Review Focus 4), so the line counts bytes, not characters, and says "bytes".
- Transparent PNGs: only opaque pixels carry bits (Review Focus 1); the capacity already reflects it, no extra copy.
- JPEG source: "Saved as PNG: a JPEG save would erase the message." shown in Embed before the key (Review Focus 2).
- The demo already carries a message; embedding into it overwrites the old header, which is fine.
- Errors from decode (over 40 MP, HEIC): the shell's error path with "Choose another photo".

## Interaction and layout

- Analyse pin: the finding only (title, body, detail: `decode` for a payload, else the `measurement` of capacity), linked derived-from the photo. The board card's readout then reads "LSB · <message>".
- Embed pin: `embed` → `encodeImage(…, "image/png")` → `pinResult` with the image titled "<source title> — with hidden message" (linked to the source) and the finding "Message hidden (LSB, N bytes)" (linked to the image), body "Share the PNG itself; re-saving it as JPEG destroys the message." N is the message's UTF-8 byte count. Pins wait on each other (the image kit's pin queue).
- The board loop: open the new image from its card ("Send to Steganography lab") and Analyse reads the message back.
- Board key top-right; Escape returns too (ToolHost).
- Phone (≤ 860px): the frame stacks Source over the column (image kit behaviour); the chart's ten columns share the column width.

## Constraints

- No new dependencies, no new hues. Theme tokens in CSS only (the chart is HTML and CSS, no canvas).
- Builders must not invent: verdict wording, thresholds, the limit sentence, the capacity error, the JPEG line, the embed titles and body.
