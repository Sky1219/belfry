---
version: 1
slug: "src-tools-photo"
primary_target: "src/tools/photo"
related_targets: ["src/tools/imagekit"]
---

# Surface brief: Photo forensics

Scope: the Photo forensics tool screen (src/tools/photo), sitting in the image kit frame (src/tools/imagekit: title plate, Source screen, panel column). Visitor mode: Operate. Inside the established Monitor Wall world (DESIGN.md); no new visual world.

Shaped 2026-10-20 without a live interview (the shape ran inside an automated build task). Every decision below is a reasonable choice in keeping with DESIGN.md, open to one correction round.

## Job and audience

- The developer checking a real photo, and cold visitors who press "Run the demo photo" from No Signal. Both want to see, within seconds, what each test says about this photo and to pin the useful readings to the case board.
- Success: every panel reads out on its own as soon as it is done; one key per panel puts the result on the wall, linked derived-from back to the photo.

## Outcome and proof

- Five tests, five screens: Copy-move, JPEG, Metadata, Error levels, Noise residual. Each screen states its result in the finding's own words (the exact title the board card will carry), then the statistic, threshold and limit sentence.
- Honesty is the product truth: ELA and noise are maps with a reading guide, never verdicts; a PNG says "Not a JPEG: quantization tests don't apply." and shows no number; an unknown value shows `--`; no "proves", "fake", "authentic", "identified".

## Selected direction

- Visual authority: DESIGN.md as shipped. The Monitor Rule (every panel is a Bezel; title, lamp, readout on the bezel), the Two Lights Rule, the Lamp Rule, the Three Voices Rule.
- Layout: the image kit frame unchanged. The photo is the main screen (left, largest); the five test screens stack in the right-hand column (300–400px), scrolling inside the column. Order: the two verdict tests first (Copy-move, which explains the amber marks on the photo in the first viewport, then JPEG), then what the file says (Metadata), then the two maps (Error levels, Noise residual). The critique (2026-10-20) moved Copy-move from last to first: at 1280×800 the marks on the photo were otherwise unexplained above the fold.
- Focal moment: the copy-move result marks the cloned regions on the photo itself (amber wash over the matched blocks, scaled up from the 512 px analysis to the photo's own coordinates), so the verdict is visible where it applies. A "no sign" result leaves the photo unmarked (amber means a finding).
- Maps (ELA, noise) sit on their panel's glass at full column width, aspect kept, in the amber heat ramp (black → amber → white). They are instrument displays, not photos, so the Lit Feed Rule's grayscale does not apply to them.

## Lamps and light (Two Lights, Lamp Rule)

- Working: lamp pulses (red, live) and the glass says "Working" in label voice.
- Done with a "consistent with" verdict (copy-move, double quantization): amber lamp (a finding), verdict line in amber.
- Done otherwise (no sign, inconclusive, facts, maps): lamp off; text in bone and steel. Nothing at rest is red.
- A test that failed: amber lamp (a warning) and the reason in plain words; the other panels carry on.
- No key is lit (Next Step Rule): the five pin keys are plain steel; the "Pinned" plate (steel) confirms each pin, with a count after more than one.

## Readouts on the bezel (mono, Three Voices)

- Copy-move: matching block count (`804 blocks`). JPEG: `Q 90` (or `--`). Metadata: none (its title already counts the fields). Error levels: `Q 90 ×20` (the re-save settings). Noise: `σ 0.82`, or `σ --`.

## States and ranges

- Photos from 1×1 to 40 MP. Maps are computed at full resolution and shown and pinned at long side ≤ 1600 px; copy-move runs at long side ≤ 512 px.
- Loading (decode, the demo's pin-and-reopen hop): the shell's own blank Source screen; panels appear once pixels are ready.
- Not a JPEG: the JPEG panel says so and offers no pin. No metadata: "Metadata: none found" with its explanation, pinnable.
- Tiny or flat images: verdicts read inconclusive; no NaN anywhere.
- Errors from decode (over 40 MP, HEIC): the shell's error path, the exact copy from the image kit.

## Interaction and layout

- Pin to board per panel. JPEG pins two findings (quality, then double quantization); ELA, noise and copy-move pin a map image plus the finding (map → photo, finding → map).
- Board key top-right returns to the wall; Escape does the same (ToolHost).
- Phone (≤ 860px): the frame stacks the Source screen (42vh) over the panels and the page scrolls (image kit behaviour).

## Constraints

- No new runtime dependencies, no new hues, no ornament on bezels. Every color from theme tokens; the canvas overlay mirrors Amber as a constant.
- The heavy per-pixel work (noise, double quantization, ELA map, copy-move) runs on the compute worker pool so the board stays responsive.
- Builders must not invent: verdict wording, thresholds, limit sentences (spec §7), or any claim beyond what a test measured.
