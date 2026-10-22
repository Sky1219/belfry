---
version: 1
slug: "src-tools-fingerprint"
primary_target: "src/tools/fingerprint"
related_targets: ["src/tools/imagekit"]
---

# Surface brief: Fingerprint lab

Scope: the Fingerprint lab tool screen (src/tools/fingerprint), sitting in the image kit frame (src/tools/imagekit: title plate, Source screen, panel column). Visitor mode: Operate. Inside the established Monitor Wall world (DESIGN.md); no new visual world.

Shaped 2026-10-20 without a live interview: the shape ran inside an automated build task with no structured question tool and no human on the line, so every decision below is the reasonable DESIGN.md-consistent choice, open to one correction round.

## Job and audience

- The developer comparing two photos of their own finger, and cold visitors who press "Run the demo prints" from No Signal. Both want to see whether two prints line up, why (the matched minutiae), and to pin the result to the case board.
- Success: the privacy notice is read and acknowledged once; then the two prints are analysed on this device and a match panel reads out a score, a verdict in the finding's own words and a side-by-side comparison, with one key to pin it.

## Outcome and proof

- One verdict test (Fingerprint match) on two prints. The panel states the finding's exact title (from `fingerprintFinding`: consistent with / no sign of / inconclusive), then the score, counts, bands and the limit sentence "Hobby-grade matching of two photos. This is not an identification."
- Honesty is the product truth: never "identified", "match confirmed" or "proves". Too little ridge detail reads inconclusive with no score; the readout shows `score --` then.
- Privacy is stated plainly before anything is analysed: the notice text and ack label are verbatim from the plan's globals.

## Selected direction

- Visual authority: DESIGN.md as shipped. The Monitor Rule (notice, print B and match are each a Bezel), Two Lights, Lamp Rule, Three Voices, Next Step Rule.
- Layout: the image kit frame unchanged. Print A (the source exhibit) is the main screen. The right-hand column holds, in order:
  1. Until acknowledged, only the **Notice** screen (amber lamp: a warning), with the notice text and the one lit key, "I'm comparing my own prints". No print is analysed and no other panel shows until it is pressed; the flag is stored in this tool's settings (`fingerprintNoticeSeen`), so it shows once per browser.
  2. **Print B** (compact): the second exhibit's thumbnail, title and `EXH·nnn`, with a plain "Compare another print" key that opens the exhibit picker. With no print B yet (a plain photo opened from the board) the picker is shown at once. The picker never offers print A (`excludeId`). The demo's print A names its partner (`meta.pairWith`), so the demo needs no picking.
  3. **Match**: the verdict screen. Readout on the bezel `score 0.69` (or `score --`). Glass: the side-by-side comparison (what gets pinned), the finding text, a key line, and the pin key.
- Focal moment: the comparison image. Both prints' ridge skeletons in dim bone (55%) over their dimmed grayscale (20%), side by side on black glass, every minutia a small square, and each matched pair joined by an amber line. The Source screen echoes it on print A: matched minutiae as amber squares, the rest bone, so the photo shows where the agreement is. The critique (2026-10-21) found 1 px strokes vanished at desktop column width (the image is shown at about a quarter size), so pair lines are 2 px and squares 8 px with 2 px strokes, and the ridges recede to 55% so the amber reads over them.
- Amber marks a finding (Ruling P2-R7): the best alignment's pairs are amber, in the comparison and on the Source screen, only when the verdict is "consistent". On "no sign" or "inconclusive" with a score they are steel and the key says they "line up under the best alignment" without calling them matches. With too little ridge detail (no score) no pairs are drawn and no count is given; the key reads "Not enough ridge detail to pair minutiae". The bezel readout shows the rounded score whenever one exists, the too-few-matched inconclusive cell included (Ruling P2-R8), and `score --` only without one.

## Lamps and light

- Notice: amber lamp (a warning that needs reading). Its ack is the surface's one engaged key (Next Step Rule).
- Print B: lamp off (an input, not live).
- Match: pulse while either print is analysed; amber on a "consistent with" verdict (title in amber); off otherwise; amber on failure with the reason in plain words.
- The pin key is plain steel; the "Pinned" steel plate confirms.

## States and ranges

- Prints from tiny to 40 MP; each is analysed at long side 640 px (downscaled on the main thread, then the `fingerprint` op on the worker pool). Minutiae coordinates are in analysis pixels and are scaled to the photo for the Source marks.
- Loading (decode, the demo's pin-and-reopen hop): the shell's blank Source screen.
- No print B yet: the Print B screen is the picker, and there is no Match screen.
- Print B can't be read (deleted, undecodable): the Print B screen says so and offers the picker.
- A photo with no print: Match reads "Fingerprint match: inconclusive" with "not enough ridge detail", `score --`; it is still pinnable (the finding is honest), with the comparison image.
- Errors from decode of print A (over 40 MP, HEIC): the shell's error path, the image kit's copy, with "Choose another photo".

## Interaction and layout

- Pin: the comparison image and the finding (image → print A, finding → image, plus finding → print B), so the board reads both prints into the result. The finding's meta holds `prints: [aId, bId]`.
- Board key top-right; Escape returns too (ToolHost).
- Phone (≤ 860px): the frame stacks Source over the column (image kit behaviour); the comparison image scales to the column width, aspect kept.

## Constraints

- No new dependencies, no new hues. Theme tokens in CSS; the canvas drawing mirrors Amber `#ffa733` and Bone as constants.
- Builders must not invent: verdict wording, thresholds, the limit sentence, the notice text or the ack label.
