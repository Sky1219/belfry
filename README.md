# Belfry

A suite of investigation and engineering tools that runs entirely in your browser, inspired by the detective work in the Batman stories. One **case board** is home base: pin evidence to it, send evidence to a tool, and the tool's findings come back to the board as new, linked evidence.

This repo currently contains the core platform and the first tool, **Detective Vision**.

## Detective Vision

A forensic camera view for your webcam or any recorded video.

**Vision modes:** Detective (dark blue grade with glowing edges), Thermal (synthetic heat built from the models: people warm, faces hottest and pulsing with your heartbeat), Night vision (real low-light enhancement: multi-frame denoising, auto gain, green phosphor), Motion (only what moved, as a fading heat trail), and Normal.

**Overlays** (mix and match): x-ray silhouettes, pose skeleton, evidence highlighting, vitals (heart rate, blink rate, gaze), depth fog, ghost trails. Save combinations as presets and switch with keys 1–9.

**Scanning:** hold an object under the reticle for 2 seconds, or click it. Belfry crops it and writes a forensic note: with your Claude API key, Claude describes the object; without one, a local note from the detector, the object's color, size and position. Both land on the board, linked.

**Capture:** snapshot or record up to 30 s, straight to the board. Recorded clips can be sent back into Detective Vision.

### How it works

```
camera / video ──► FrameSource ──► ModelScheduler ──┬─► segmentation (MediaPipe) ──► mask texture ─┐
                                                    ├─► face mesh ──► heart rate (POS rPPG), blinks, gaze
                                                    ├─► pose ──► skeleton                          │
                                                    ├─► objects ──► tracker ──► scan / evidence ───┤
                                                    └─► depth (Depth Anything, Web Worker) ──► depth texture
                                                                                                   ▼
                                    WebGL2 renderer (5 mode shaders + history buffers) ──► canvas + 2D HUD
```

- **Model scheduler** (`src/platform/scheduler.ts`): every model runs at its own rate; slow async models (depth) never block a frame; when frames run long it slows the least important model first and speeds things back up when there's headroom. Models load only when a feature that needs them is switched on.
- **Heart rate** (`features/rppg.ts`): averages forehead and cheek color each frame, applies the POS method (Wang et al., 2017) to cancel lighting changes, and finds the dominant frequency in 42–180 BPM. A reading is shown only when both halves of the 10 s window agree and several consecutive estimates are stable. Otherwise it shows `--` rather than a made-up number.
- **Renderer** (`gl/`): one fragment shader per mode over a shared header; night vision, motion heat and ghost trails keep ping-pong history buffers on the GPU; mode changes cross-fade with a radial pulse.
- **Case board** (`board/`, `store/`): IndexedDB storage with a change log and soft deletes so a sync service can be added later; whole cases export to a `.belfry` file (zip of JSON records + media).

## Run it

```bash
npm install        # also copies MediaPipe's WASM into public/
npm run dev
```

Open the printed URL. Camera access needs `localhost` or HTTPS. Models download from Google's and Hugging Face's CDNs the first time a feature needs them (depth is ~50 MB).

**Mock mode:** add `?mock` to the URL to replace every model with synthetic output (a swaying figure, a drifting cup, a blinking face). Useful for working on the UI without downloads, or when you have no good camera.

**Claude API key (optional):** Settings → paste a key. It's sent only to `api.anthropic.com`, and each scan sends one small JPEG crop. By default the key is remembered in this browser's storage. Note that browser storage is shared by every page on the same origin, so on `https://<you>.github.io/belfry/` your other GitHub Pages projects could read it. Turn off **Remember key on this device** to keep it only for the current tab, or deploy Belfry on its own domain.

## Test

```bash
npm test           # unit tests (Vitest)
npm run test:e2e   # browser tests (Playwright, fake camera + ?mock)
```

Live-model checks that need a real camera are in [`docs/manual-checklist.md`](docs/manual-checklist.md).

## Deploy

`npm run build` outputs a static site in `dist/`. Pushing to `main` deploys it to GitHub Pages via `.github/workflows/pages.yml` (enable Pages → "GitHub Actions" in the repo settings).

## Privacy

Video is processed entirely in your browser; nothing is uploaded. The only exception is scan crops sent to Claude when you've added your own API key. Heart rate and other vitals are rough estimates for fun, **not** medical measurements.

## Roadmap

| # | Sub-project | Tools |
|---|---|---|
| 1 | **Core + Detective Vision** ✅ | Case board, tool interface, model scheduler; Detective Vision |
| 2 | Image forensics | Photo forensics, fingerprint lab, steganography lab, shadow geolocation |
| 3 | Audio | Signal decoder (incl. electrical hum analysis), echolocation, voice modulator |
| 4 | Video | "Enhance" (multi-frame super-resolution); scene reconstruction |
| 5 | Devices | Watchtower (phone cameras), secure channel (end-to-end encrypted messaging) |
| 6 | Board intelligence | Case generator, the Butler (voice agent), patrol map |
| 7 | Workshop | Gadget CAD, stress test (FEM), glider lab, circuit bench, drone lab, pursuit planner |

Design docs live in `docs/superpowers/`.
