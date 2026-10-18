# Detective Vision

A real-time "detective vision" camera effect that runs entirely in the browser. Your webcam feed turns into a dark blue forensic view: edges glow, people become x-ray silhouettes, and the effect sweeps in with a radial pulse. Inspired by the detective mode from the *Arkham* games.

All processing is on-device. No video leaves your machine.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL and click **Enable Camera**. Camera access needs `localhost` or HTTPS.

| Key / action | Effect |
|---|---|
| `V` or click | Toggle detective vision |
| `M` | Toggle mirroring |

## How it works

```
webcam ──► <video> ──┬──► ModelScheduler ──► person segmenter (MediaPipe, GPU) ──► mask texture ─┐
                     │                                                                          ▼
                     └──────────────────────────────────────────────► video texture ──► WebGL2 shader pass ──► canvas
```

- **`src/gl/shaders.ts`** – one fragment shader: Sobel edges, blue grade, x-ray silhouette with a rim from the mask gradient, scanlines, vignette, and the activation pulse.
- **`src/gl/renderer.ts`** – WebGL2 setup and texture uploads.
- **`src/models/segmenter.ts`** – MediaPipe selfie segmenter wrapper.
- **`src/models/scheduler.ts`** – runs each model at its own frame interval and tracks per-model latency, so more models can share the frame budget.

## Roadmap

- [x] Shader look + person segmentation
- [ ] Pose skeleton inside the silhouette
- [ ] Object detection: highlight phones, keys, bottles as "evidence"
- [ ] Heart-rate readout from the face (rPPG)
- [ ] Hold-to-scan: a vision-language model writes a forensic note about an object
- [ ] Footprint trails via optical flow
- [ ] Depth fog from monocular depth estimation
- [ ] Adaptive scheduling: tune model rates live to hold 30 fps

## Deploy

`npm run build` outputs a static site in `dist/` that works on GitHub Pages.
