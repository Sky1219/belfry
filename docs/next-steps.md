# Belfry: next steps

A working scaffold for what comes after sub-project 1, written 2026-10-18. Every sub-project still gets its own spec → plan → build cycle (`docs/superpowers/`). This file is the map, not the specs. Tick boxes as things land.

## Where things stand

- **Shipped on `feat/belfry-core`** (PR [Sky1219/belfry#1](https://github.com/Sky1219/belfry/pull/1), open against `main`):
  - Sub-project 1: case list, case board, evidence store, tool interface, model scheduler, LLM client, `.belfry` export/import.
  - Detective Vision: five modes, overlays, vitals, scanning, capture, plus a synthetic demo feed for visitors with no camera.
- **Design system:** the "Monitor Wall" world, recorded in [`DESIGN.md`](../DESIGN.md) and `.impeccable/design.json`.
  - Black-glass screens in gunmetal bezels, signal red for live/selected/primary, amber for findings.
  - Barlow Condensed / Barlow / JetBrains Mono, self-hosted.
  - Product truth is in [`PRODUCT.md`](../PRODUCT.md); the board's direction contract is in `.impeccable/surfaces/src-board.md`.
- **Quality bar today:**
  - tsc is clean.
  - 131 unit tests and 8 Playwright tests pass.
  - The board critique went 18 → 28/40; the last critique's fixes are applied but not yet re-scored.

## 0. Housekeeping before anything new

- [ ] Commit the uncommitted work as reviewed chunks. Suggested order:
  1. the Detective Vision HUD pass
  2. the monitor-wall redesign
  3. the critique fixes
  4. this file
- [ ] Decide what of `.claude/` and `.impeccable/` belongs in git.
  - Keep: `DESIGN.md`, `.impeccable/design.json`, `.impeccable/surfaces/`.
  - Probably ignore: `.impeccable/review/` and `.impeccable/critique/`, which are working artifacts.
  - Probably ignore: `.claude/launch.json` and the vendored `.claude/skills/`, unless you want them shared.
- [ ] Re-run `/impeccable critique src/board` to score the latest fixes. Target 32+/40.
- [x] Add manual-checklist rows for the demo feed, file drop, link avoidance, Ctrl+Z, dimming, compact cards, the phone rail and the key default.
- [ ] Run [`docs/manual-checklist.md`](manual-checklist.md) on a real camera with real models.
- [ ] Merge PR #1, then enable GitHub Pages ("GitHub Actions" source) and check the deployed build.
- [x] Add CI for pull requests (`.github/workflows/ci.yml`: tsc, unit, Playwright with Chromium) with one retry on CI only.
- [x] Look at test flakiness under load. The Detective Vision e2e test and one store-numbering test failed once each on a busy machine.
  - The numbering bug was real and is fixed: ids are now monotonic.
  - Still to do: consider `retries: 1` for CI only, and a longer per-test timeout for the GPU tests.
- [x] Checked: `npm audit --omit=dev` reports 2 high and 4 moderate issues, mostly via `@huggingface/transformers` → `sharp` (a Node-only image library; the browser build never runs it). Confirmed unreachable: no Node-only package is in the browser bundle. The real fix is transformers.js 4.x, a major upgrade that changes the depth model's runtime and needs a real-model check, so it's tracked as its own task below.
- [x] Build warned about a >500 kB chunk. Done: vendors split into `vendor-react`, `vendor-flow` and `vendor-store`, and the board lazy-loads. Code-split the model and adapter code, so the board loads without the vision stack.

## 1. Board and shell follow-ups (from the last critique, not yet done)

These are P2/P3 items deliberately left for later. Each is small enough for one session.

- [x] **Multi-select and bulk actions:** shift-click and marquee are already in React Flow; add bulk remove, bulk link and bulk tag.
- [x] **"Send to" from the evidence index row**, not just from the card menu.
- [x] **Case list search and sort** (by number, name, last activity) once cases pile up.
- [x] **Undo beyond deletes:** edits and moves, with a small history per board session.
- [x] **Teach drag-to-link:** a one-time hint on the first hover of a connector stud, and "Link to…" mentioned in the empty state.
- [x] **Perf panel:** keep it, but tuck it behind `?perf` or a Settings toggle so visitors don't see it by default.
- [x] **Open questions from the critique** (decided 2026-10-19):
  - The board is the map and the index is the reading surface. The selected exhibit's index row opens to the full exhibit: full text, preview, playable audio, finding readout, provenance and every card action.
  - The four OFFLINE roadmap tools stay where they are, for now.
- [x] **Detective Vision console density:** about 28 controls are visible at once. Group presets and overlays behind one disclosure on phones.

- [x] **Upgrade `@huggingface/transformers` 3.8 → 4.x:** done (4.3.1). `npm audit --omit=dev` is clean. The worker API was unchanged, and ONNX Runtime now sits in its own worker chunk (`vendor-ort`) so no chunk is over 500 kB. Real-model WASM depth was smoke-tested in headless Chromium. Still to do: the WebGPU path and a real camera ("Depth after the transformers upgrade" in the manual checklist).
- [ ] **Depth on WebGPU without fp16:** `depth.ts` asks for fp16 whenever `navigator.gpu` exists, but transformers.js (3.x and 4.x alike) throws "does not support fp16" on adapters without `shader-f16`, and depth never loads. Check the adapter's features first, or fall back to fp32 or WASM q8 when that load fails.
- [ ] **26 MB unused WASM in `dist/`:** ONNX Runtime's bundle makes Vite emit `ort-wasm-simd-threaded.asyncify.wasm`, but transformers.js loads the runtime from jsdelivr (3.x emitted a 21 MB `jsep.wasm` the same way). Either self-host it (point `env.backends.onnx.wasm.wasmPaths` at our copy, like MediaPipe's) or stop emitting it.

## 2. Platform work every later tool needs

Do these in or before sub-project 2. They unblock everything below. Spec: [`2026-10-19-tool-platform-design.md`](superpowers/specs/2026-10-19-tool-platform-design.md).

- [x] **Tool inputs:** done.
  - `src/tools/inputs.ts` parses route inputs (`live-camera`, `demo`, `pick`, `ev:<id>`; the old `demo-feed` still parses).
  - The shared No Signal screen (`src/tools/NoSignal.tsx`) lists the case's evidence the tool accepts, opens a file (pinned to the case first) or runs the demo. Detective Vision's camera-error screen is now that component.
  - The rack lists every tool; a tool without a camera opens on `pick`.
  - `ctx.openInput` replaces hand-built routes.
- [x] **Synthetic inputs per tool:** `demo: { label }` is a required manifest field, so a tool can't register without a demo. The input kind is `{ kind: "demo" }`.
- [x] **Evidence types:** `finding` stays one type.
  - A finding can carry a typed `meta.finding`: a measurement (± uncertainty), a location (± radius) or a decode.
  - It is validated on read, so a malformed import shows no readout instead of breaking.
  - Cards and index rows show it as an amber readout, and the label reads "Finding · Measurement". The demo case's finding has one.
- [x] **Workers:** done.
  - `src/platform/workers/` holds `WorkerPool`: lazy, at most min(4, cores − 1) workers, a FIFO queue, transferables, abort, crash recovery.
  - The op table, the compute worker and the typed `compute.fft` live there too.
  - The FFT moved to `src/platform/math/fft.ts` and gained an inverse; `rppg.ts` uses it.
  - Not yet run in a real browser: nothing calls the pool until the first tool needs it.
- [x] **LLM client:** done.
  - New calls: `message()` (any content, tools), `text()`, `stream()` (SSE, with an idle timeout) and `toolLoop()`. In `toolLoop()`, an unknown tool or a handler that throws goes back to the model as an error, and the loop stops at a turn limit.
  - `describeImage` is a thin wrapper, and there is a new `aborted` error kind.
  - Every LLM feature still keeps a non-LLM fallback (PRODUCT.md).
  - The stream parsing is checked against fakes only. Run it against the real API with a key before the Butler relies on it.
- [ ] **Design system for tools:** every tool screen follows The Monitor Rule (DESIGN.md). Run `/impeccable shape <tool>` before building each tool's UI.
- [ ] **Testing pattern:** mock mode plus deterministic synthetic inputs per tool, unit tests for the maths, and one Playwright flow per tool that ends with evidence on the board. (Written into the spec; it applies from the first new tool.)

## 3. Roadmap sub-projects

Each sub-project below is a scaffold for its spec:
- **Core:** what the tool must really compute. No skins, no minigames (PRODUCT.md).
- **Board loop:** what goes in and what comes back.
- **Spec questions:** decisions to settle first.
- **Done:** the bar for calling it finished.

### Sub-project 2: Image forensics

- [x] **Photo forensics** (shipped: `src/tools/photo`, with a seeded demo photo; real photos are on the manual checklist)
  - **Core:** error level analysis; JPEG quantization-table and double-compression checks; EXIF/XMP read-out; noise-residual maps; copy-move detection (block matching or keypoints).
  - **Board loop:** image evidence in; a heat-map image and a finding back, linked derived-from.
- **Fingerprint lab**
  - **Core:** ridge enhancement (Gabor bank), orientation field, minutiae extraction (crossing number), minutiae matching.
  - **Board loop:** two fingerprint photos in; a match score with an overlay out.
- **Steganography lab**
  - **Core:** LSB embed/extract, plus chi-square and RS steganalysis to detect hidden payloads.
  - **Board loop:** an image in; the extracted payload, or a "likely clean" verdict with its statistic, out.
- **Shadow geolocation**
  - **Core:** solar position (NOAA/SPA algorithm), so shadow azimuth and length plus a date and time constrain latitude and longitude.
  - **Board loop:** a photo plus user-marked shadow lines in; a location curve out (later plotted on the patrol map).
- **Spec questions:**
  - Which formats to support (HEIC?).
  - How to state uncertainty honestly in findings.
  - Privacy wording for fingerprints (own prints only).
- **Done:** each tool has a demo input, its maths is unit-tested against known fixtures, and every result lands on the board with provenance.

### Sub-project 3: Audio

- **Signal decoder**
  - **Core:** STFT spectrogram; DTMF and Morse decoding; electrical network frequency (ENF) extraction at 50/60 Hz.
  - **Honest limit:** ENF timestamp matching needs reference grid data. Ship extraction, and state that matching needs a reference recording.
- **Echolocation**
  - **Core:** emit a chirp through the speakers and cross-correlate the mic capture to estimate reflection distances (an impulse response).
  - **Constraint:** works at a desk; no movement needed.
- **Voice modulator**
  - **Core:** real-time pitch and formant shifting (phase vocoder or PSOLA) in an AudioWorklet.
- **New platform needs:**
  - an audio `FrameSource` equivalent
  - mic permission flow with a file fallback (as for the camera)
  - an `audio` evidence card with a waveform thumbnail
- **Spec questions:** latency budget for the modulator, whether evidence stores raw audio or compressed, and the demo inputs.

### Sub-project 4: Video

- **Enhance (multi-frame super-resolution)**
  - **Core:** frame registration (phase correlation or optical flow), then shift-and-add with iterative back-projection.
  - **Honest limit:** never invent detail. Show the frames used and the measured registration error.
- **Scene reconstruction (stretch):** fuse Depth Anything depth over frames into a point cloud and view it in three.js.
- **Board loop:** a video clip plus a region in; an enhanced still, or a point-cloud snapshot, back.
- **Spec questions:** compute budget (WebGPU?), maximum clip length, and how to label "enhanced" so it's never mistaken for ground truth.

### Sub-project 5: Devices (needs a server)

- **Watchtower:** phone cameras as remote feeds over WebRTC, appearing as feeds on the monitor wall.
- **Secure channel:** end-to-end encrypted messaging between Belfry instances (WebCrypto key agreement plus AES-GCM; consider a ratchet). A security review is required before shipping.
- **Spec questions:**
  - **Signaling:** a tiny WebSocket server, or a hosted peer broker, and where it lives.
  - Pairing UX via QR code.
  - Whether evidence syncs. The change log was built for this (spec §4.2).
- **Done:** two devices pair and stream, nothing travels unencrypted, and the server stores no content.

### Sub-project 6: Board intelligence

- **Case generator**
  - **Core:** a constraint solver (CSP with backtracking) that builds a consistent mystery: suspects, timeline and clues, with exactly one solution.
  - **Board loop:** output lands as a staged case, like the demo.
- **The Butler**
  - **Core:** a voice agent using Web Speech for speech-to-text and text-to-speech, and Claude tool use to call registered tools and pin results.
  - **Fallback:** without a key, a small command grammar.
- **Patrol map:** a map of geolocated evidence. Decide the tile source (OSM via MapLibre) and offline behavior.
- **Spec questions:**
  - How the Butler asks before acting (it must never take irreversible steps alone).
  - Map tiles versus "local and private by default".

### Sub-project 7: Workshop

| Tool | Core |
|---|---|
| Gadget CAD | Constructive solid geometry in the browser (three.js plus a manifold/CSG kernel). Non-weapon gadgets only (spec exclusion). |
| Stress test | Linear-elastic finite element analysis (2D, then 3D tetrahedra) on CAD parts, with a stress heat-map. |
| Glider lab | Lifting-line or vortex-lattice aerodynamics, plus a simple flight sim. |
| Circuit bench | Modified nodal analysis, a small SPICE-like DC/transient solver with a schematic editor. |
| Drone lab | Quadcopter rigid-body dynamics with PID tuning in a sim. |
| Pursuit planner | Route and path planning (A*, RRT) on a map or grid. Vehicles and routes only. |

- **Spec questions:**
  - Which tool goes first (circuit bench and stress test have the clearest cores).
  - How workshop results become evidence (a part drawing, a stress report).

## 4. Guardrails that apply to every step

- No DC/Warner names, logos, bat silhouettes or licensed fonts in shipped UI.
- No facial recognition or plate reading of real people, and no weapon-like design (spec §1.3).
- Every reading is honest: an unknown shows `--`, and a fallback names itself.
- Video is processed locally. Only a scan crop is sent, and only to Claude, with the user's own key.
- Every tool works without a key, and has a demo for visitors without the hardware.
- Every new screen is a bezelled screen in the Monitor Wall world, checked with `/impeccable critique` before merge.
