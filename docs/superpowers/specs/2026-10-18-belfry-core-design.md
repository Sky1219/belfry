# Belfry — Core Platform + Detective Vision (Sub-project 1) Design

**Date:** 2026-10-18
**Status:** Draft for review
**Repo:** currently `detective-vision/` (to be renamed `belfry`)

---

## 1. Context

### 1.1 What Belfry is

Belfry is a browser-based suite of investigation and engineering tools inspired by the Batman mythos. A single **case board** is home base: evidence is pinned to it, sent ("delegated") to tools, and the tools' findings come back to the board as new, linked evidence.

The bar for every tool: it must have a real technical core (computer vision, signal processing, simulation, cryptography, etc.), not a skin over trivial code and not a minigame.

### 1.2 Understanding (agreed)

- **Purpose:** a fun personal project. The code should be solid and well tested; no write-up or portfolio polish is required.
- **Branding:** original name ("Belfry") and original visuals. No DC/Warner Bros names, logos, fonts, or assets. The README may say "inspired by".
- **Environment constraints:** the developer works at a desk with a weak laptop webcam and little space. Every camera tool must accept recorded video files as a first-class input, and no tool may require full-body movement.
- **Deployment:** static site (GitHub Pages). No server in sub-project 1.

### 1.3 Suite roadmap (seven sub-projects)

Each sub-project gets its own spec → plan → implementation cycle. Sub-project 1 must come first; the order of the rest is flexible.

| # | Sub-project | Tools |
|---|---|---|
| 1 | **Core + Detective Vision** (this spec) | App shell, case board, tool interface, media sources, model scheduler, LLM client, evidence store; Detective Vision |
| 2 | Image forensics | Photo forensics, fingerprint lab, steganography lab, shadow geolocation |
| 3 | Audio | Signal decoder (incl. electrical hum analysis), echolocation, voice modulator |
| 4 | Video | "Enhance" (multi-frame super-resolution); scene reconstruction (stretch) |
| 5 | Devices | Watchtower (phone cameras over WebRTC), secure channel (E2E encrypted messaging). Needs a small signaling server — decided in that sub-project's spec. |
| 6 | Board intelligence | Case generator (constraint-solved mysteries), the Butler (voice agent that calls tools), patrol map |
| 7 | Workshop | Gadget CAD, stress test (FEM), glider lab, circuit bench, drone lab, pursuit planner |

Deliberately excluded from the whole suite: facial recognition and license-plate reading of real people; weapon-like gadget design (projectile aerodynamics, armor ballistics); trivial shader-only tools and minigames as standalone tools.

### 1.4 Sub-project 1 success criteria

1. Open Belfry, create a case, and see an empty pinboard with an evidence sidebar.
2. Start Detective Vision from the board on the live webcam **or** on a video evidence item.
3. Switch every vision mode and toggle every overlay; each works or reports why it can't.
4. Scan an object; a cropped image and a forensic note appear on the board, linked.
5. Snapshot and clip buttons send the current view to the board.
6. Close the browser, reopen, and the case is intact. Export the case to a `.belfry` file and import it back identically.
7. With no API key, everything above still works, using local notes.

---

## 2. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Data location | **Local-first, sync-ready.** IndexedDB now; data layer designed so a sync backend can be added without a rewrite. | No server now; avoids a rewrite when sub-project 5 adds devices. |
| Board style | **Freeform pinboard + searchable evidence sidebar.** | The pinboard gives the atmosphere; the sidebar keeps 50+ items findable. |
| LLM use | **Bring your own Claude API key**, stored only in the browser, called directly from the browser. Every LLM feature has a non-LLM fallback. | Public repo: visitors use their own keys; the app works without one. |
| Stack | **React + TypeScript + Vite.** Pinboard via React Flow (`@xyflow/react`). Performance-critical code (rendering, models, scheduler, signal processing) is framework-free TypeScript. | Largest ecosystem for the ~20 future tool UIs (maps, 3D, etc.); heavy code stays independent of React. |

---

## 3. Architecture

```
┌─ App shell (React) ──────────────────────────────────────────────┐
│  Case board (pinboard + sidebar)   Tool host   Settings   HUD UI │
├─ Tool interface ─────────────────────────────────────────────────┤
│  Detective Vision (later: forensics, audio, workshop…)           │
├─ Platform services (plain TS, no React) ─────────────────────────┤
│  Media sources   Model scheduler   LLM client   Evidence store   │
├─ Storage ────────────────────────────────────────────────────────┤
│  IndexedDB + change log (sync can plug in here later)            │
└──────────────────────────────────────────────────────────────────┘
```

Each layer talks only to the layer below it, through a small interface.

### 3.1 App shell

- **Case list** (open/closed cases) and **case board** per case.
- **Settings:** API key (with a note that it is stored in this browser only), default Detective Vision preset, storage usage, export/import.
- **HUD design system:** shared colors, typography (monospace, cyan-on-dark), panels, buttons, status chips, progress rings. Every tool uses it so the suite feels like one product.

### 3.2 Tool interface

A tool is registered with a manifest:

```ts
interface ToolManifest {
  id: string;                    // "detective-vision"
  name: string;                  // "Detective Vision"
  accepts: EvidenceInput[];      // e.g. ["live-camera", "video"]
  open(ctx: ToolContext): ToolHandle;  // mounts full-screen over the board
}

interface ToolContext {
  caseId: string;
  input: FrameSourceSpec | EvidenceRef;   // what the user delegated
  evidence: EvidenceStore;                // to add findings
  llm: LlmClient;
  scheduler: ModelScheduler;
  close(): void;
}
```

- **Delegation:** from a card's menu ("Send to → Detective Vision") or the board toolbar ("Open Detective Vision → live camera"). Only tools that accept the evidence type are offered.
- **Results:** a tool writes new evidence through `ctx.evidence`, always with `provenance` and a "derived from" link to its input when there is one.
- Adding a tool never requires changing board code; tools are listed from a registry.

### 3.3 Platform services

- **Media sources.** Webcam, video file (from evidence), and still image all implement one `FrameSource` interface: current frame (as something drawable/uploadable to WebGL), dimensions, timestamp, and play/pause/seek where applicable. Tools never care where frames come from.
- **Model scheduler.** Runs model tasks at per-task intervals; supports async (worker-based) tasks; skips tasks no active feature needs; adapts intervals to hold the frame-rate target (details in §5.6).
- **LLM client.** Wraps the Claude Messages API (`claude-haiku-5-5`, image + text input) with the key from settings. Exposes `available()` and returns typed errors so callers can fall back.
- **Evidence store.** CRUD for cases, evidence, links, blobs; subscription API so the board updates live; export/import.

---

## 4. Data model

### 4.1 Records

- **Case:** `id`, `title`, `status` (`open` | `closed`), `createdAt`, `updatedAt`, `deleted`.
- **Evidence:** `id`, `caseId`, `type` (`image` | `video` | `audio` | `note` | `finding`), `title`, `body?` (text), `tags[]`, `blobHash?`, `thumbHash?`, `provenance` (`{ toolId?, sourceEvidenceId?, createdAt }`), `position` (`{x, y}` on the board), `meta` (tool-specific JSON, e.g. detector label/confidence), `createdAt`, `updatedAt`, `deleted`.
- **Link:** `id`, `caseId`, `fromId`, `toId`, `kind` (`derived-from` | `user`), `label?`, `createdAt`, `deleted`.
- **Blob:** `hash` (SHA-256 of bytes), `mime`, `size`, `bytes`. Content-addressed, deduplicated. Blobs are kept out of evidence records so the board loads fast; thumbnails are separate small blobs.

### 4.2 Sync readiness

- IDs are ULIDs (globally unique, time-sortable), never counters.
- Deletes are soft (`deleted: true`), so a deletion can be propagated.
- Every write appends a **change log** entry: `{ seq, recordType, recordId, op (put|delete), at }`. A future sync server replays this log. Sub-project 1 does not sync; it only writes the log.

### 4.3 Export / import

- A case exports to a `.belfry` file: a zip with `manifest.json` (format version, case record), `records.json` (evidence, links), and `blobs/<hash>`.
- Import validates the format version and structure before writing anything; on any error it writes nothing and reports why.
- Importing a case whose ID already exists asks: replace, or import as a copy (new IDs).

### 4.4 Example

Scanning a mug produces: an `image` evidence (the crop) and a `finding` evidence (the note, `meta.source = "llm" | "local"`), joined by a `derived-from` link, positioned next to each other near the board's current view.

---

## 5. Detective Vision

### 5.1 Inputs

Live webcam, or a video evidence item (play/pause/scrub controls). Still images are not an input for this tool (most features need motion).

### 5.2 Vision modes (exactly one active)

| Mode | What it does |
|---|---|
| **Detective** | Dark blue grade, Sobel edge glow, scanlines, vignette. |
| **Thermal** | Synthetic thermal built from model outputs, not raw brightness: people (segmentation) read hot, skin/face hottest, face intensity pulses with the measured heart rate when available, background cools with depth when available. Palettes: ironbow, white-hot, black-hot. |
| **Night vision** | Real low-light enhancement: temporal denoising (multi-frame averaging), automatic gain and gamma; then green phosphor tint, grain, and bloom around bright points. |
| **Motion** | Shows only change: frame differencing into a decaying motion-history buffer, so recent movement leaves a fading heat trail. |
| **Normal** | Unmodified camera; overlays only. |

Switching modes plays the radial pulse transition from the old look to the new one.

### 5.3 Overlays (independently toggleable, work in every mode)

- **X-ray silhouette** — glowing person fill and rim from segmentation.
- **Pose skeleton** — joints and bones from pose landmarks.
- **Evidence highlighting** — orange outlines and `EV-nn` tags around evidence-class objects (phone, keys, cup, bottle, book, laptop, remote, scissors, backpack, handbag, etc.; never `person`).
- **Vitals** — heart rate, blink rate, gaze direction (see §5.5).
- **Depth fog** — darkens distant regions.
- **Ghost trails** — fading afterimages of people (person-mask history).
- **HUD density** — full / minimal / off.

### 5.4 Presets

A preset = one mode + a set of overlays + palette. Built-ins: **Investigate** (detective + x-ray + evidence + depth), **Interrogation** (normal + vitals + skeleton), **Stakeout** (night vision + evidence + ghost trails), **Heat** (thermal + vitals). Users can save their own. Number keys 1–9 switch presets.

### 5.5 Feature details

- **Segmentation:** MediaPipe selfie segmenter (confidence mask).
- **Pose:** MediaPipe Pose Landmarker (lite).
- **Objects:** MediaPipe Object Detector (EfficientDet-Lite0, COCO classes). A greedy IoU tracker assigns stable IDs, smooths boxes (exponential moving average), and drops a track after ~0.5 s unseen.
- **Face:** MediaPipe Face Landmarker (provides the face box, eye landmarks for blinks, and iris landmarks for gaze).
- **Heart rate (rPPG):** mean RGB of forehead and cheek regions each frame → resample to a uniform rate → POS algorithm (plane-orthogonal-to-skin) → spectral peak in 0.7–3.0 Hz (42–180 BPM) over a ~10 s window. Reported with a confidence (peak share of band power); hidden below a threshold or before 6 s of stable signal. Labelled as an estimate, not a medical reading.
- **Blink rate:** eye aspect ratio from eye landmarks with hysteresis thresholds; blinks per minute over a rolling window.
- **Gaze:** iris position relative to eye corners → left / center / right / down, plus "looked away" percentage.
- **Depth:** Depth Anything V2 Small via Transformers.js, in a Web Worker. WebGPU (fp16) when available and on by default; otherwise WASM (q8), off by default. Input downscaled; output crossfades between updates to avoid popping.

### 5.6 Scheduling

| Task | Default interval | Notes |
|---|---|---|
| Segmentation | every frame | needed by x-ray, thermal, ghost trails |
| Face landmarks | every frame | needed by vitals, thermal |
| Pose | every 2 frames | needed by skeleton |
| Object detection | every 3 frames | needed by evidence, scanning |
| Depth | every ~10 frames (async, worker) | needed by depth fog, thermal |

- Tasks whose features are all off do not run (and their models are not loaded until first needed).
- An async task is never started again while its previous run is in flight.
- Adaptive policy: every ~1 s, if the smoothed frame time exceeds the budget (30 fps target), increase the interval of the lowest-priority running task (up to a cap); if well under budget, decrease the highest-priority task's interval (down to its default).
- Models only run on new camera/video frames, not every display refresh.
- A perf panel shows each task's average cost, current interval, and status.

### 5.7 Scanning

- **Trigger:** an evidence object under the center reticle for 2 s continuously (progress ring), or a click on its outline (immediate). `S` scans the center region even with no detected object.
- **Cooldown:** the same track is not auto-scanned again for 10 s.
- **Capture:** the object box plus 15% padding is cropped from the source frame (not the stylized view), max 512 px on the long side, JPEG.
- **Note (with key):** Claude receives the crop and the detector label/confidence; system prompt asks for a terse forensic observation, ≤ 30 words, describing only the object and visible condition, never identifying or speculating about people.
- **Note (no key or API failure):** a local note from label, confidence, dominant color name, relative size, position in frame, and time in view. On API failure the finding is marked `LOCAL ANALYSIS` with the reason.
- Both crop and note are written to the board as linked evidence; the note also appears in a "case file" panel in the HUD with a typewriter reveal.

### 5.8 Capture to board

- **Snapshot:** current stylized frame with overlays (WebGL canvas and 2D overlay canvas composited into one image) → `image` evidence.
- **Clip:** the same composite drawn each frame to a capture canvas, recorded with `MediaRecorder` (WebM) for up to 30 s → `video` evidence.

### 5.9 Rendering

- WebGL2. One pass per mode; overlays that are per-pixel (x-ray, depth fog, ghost trails, evidence edge tint) are shader uniforms/textures; vector overlays (skeleton, boxes, tags, vitals, reticle) are drawn on a 2D canvas layered on top.
- The video is cover-fitted to the screen (no stretching). One mapping module converts between video coordinates and screen coordinates, including mirroring; shader and 2D overlay both use it.
- Multi-frame effects (night-vision denoise, motion history, ghost trails) use ping-pong framebuffers.

### 5.10 Mock mode

`?mock` replaces every model with synthetic output (moving silhouette, walking skeleton, drifting evidence boxes, face with a synthetic pulse, depth gradient). Used for UI development and browser tests without model downloads.

---

## 6. Error handling

Principle: a missing piece disables one feature, never the app.

- **Camera:** permission denied / not found → message + "open a video file instead". Disconnect mid-session → freeze on last frame with `SIGNAL LOST`, auto-reconnect.
- **Models:** loaded independently in the background; Detective Vision starts immediately with the shader, features enable as their models arrive. HUD status per model: loading / ready / offline. A failed download disables only dependent features, with retry. GPU delegate failure → CPU fallback. No WebGPU → depth uses WASM and defaults off.
- **LLM:** no key → local notes (normal behavior, not an error). Invalid key, rate limit, or network error → local note marked `LOCAL ANALYSIS` with the reason; a scan is never lost.
- **Storage:** IndexedDB unavailable → banner "cases won't be saved", in-memory store. Near quota → warning suggesting export. Import is validated and atomic (§4.3).
- **Performance:** if the frame rate stays below target after the scheduler has backed off every optional task, the HUD suggests disabling the heaviest active overlay by name.

---

## 7. Testing

### 7.1 Unit tests (Vitest)

- **rPPG:** synthetic face-color signals with a known pulse plus noise, illumination drift, and dropped/irregular frames → estimate within ±3 BPM; pure noise → low confidence, no reading.
- **Blink / gaze:** synthetic landmark sequences with known blinks and look-aways.
- **Scheduler:** fake tasks with known costs → intervals respected, inactive tasks skipped, back-off and recovery under load, no concurrent re-entry for async tasks.
- **Tracker:** stable IDs across frames, smoothing, expiry.
- **Scan trigger:** 2 s dwell, reset on target change, cooldown, click-to-scan.
- **Local notes:** color naming and note text for fixed inputs.
- **Coordinate mapping:** video↔screen round trips with cover-fit and mirroring.
- **Data layer** (`fake-indexeddb`): CRUD, links, soft delete, change log; export → import yields an identical case; corrupt or wrong-version files are rejected with nothing written.
- **LLM client:** mocked API → request shape (headers, model, image block); each error class → fallback.

### 7.2 Browser tests (Playwright, headless Chromium, fake camera, `?mock`)

- End-to-end: create case → open Detective Vision → cycle every mode and overlay → scan → finding and image appear on the board, linked → reload → still there → export/import.
- Screenshot per vision mode, reviewed by eye during development.
- Shader compile check (any shader compile/link error fails the run).

### 7.3 Manual checklist (developer's machine)

The development workspace cannot download models, so the plan ends with a short checklist for the developer: every model reaches "ready"; heart rate roughly matches a manual pulse count in good light; blink count matches deliberate blinks; scan produces an LLM note with a key; frame rate holds ~30 fps with the Investigate preset.

---

## 8. Out of scope for sub-project 1

- Any tool other than Detective Vision.
- Sync, accounts, multiple devices, phone-as-camera.
- Footprint trails (need full-body framing).
- Board automation (auto-suggested links, the Butler).
