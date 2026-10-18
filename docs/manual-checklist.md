# Manual checklist (real camera, real models)

The automated tests run with a fake camera and mock models, because the development sandbox can't download models. Run through this on your own machine after `npm run dev` (Chrome or Edge; good, even lighting helps).

## Models

- [ ] **First:** with X-ray on, the glowing silhouette covers *you*, not the room around you. (If it's inverted, the segmenter's mask order differs from what Belfry expects — see `models/maskIndex.ts`.)
- [ ] Open a case → **◉ Detective Vision**. With the Investigate preset, the `SEG`, `DETECT` and `DEPTH` chips reach **READY** (depth only if WebGPU is available or depth is enabled in Settings).
- [ ] Switch to the Interrogation preset (key `2`): `FACE` and `POSE` reach **READY**.
- [ ] Open **Perf**: every active model shows a cost in ms and an interval; nothing says offline.

## Vitals

- [ ] Sit still facing the camera in good light for 30 s with Vitals on. A heart-rate reading appears (after ~10 s) and is within ~5 BPM of your pulse counted manually for 30 s × 2.
- [ ] Cover the camera or turn away: the reading goes back to `--` instead of showing a number.
- [ ] Blink deliberately 10 times over 30 s: BLINK/MIN rises accordingly.
- [ ] Look left and right: GAZE changes and AWAY % increases.

## Scanning

- [ ] Hold a mug, phone or bottle under the reticle for 2 s: a ring fills, then a crop and a note appear on the board, linked.
- [ ] Without an API key the note is a local one (color, size, position, confidence).
- [ ] Add a Claude API key in Settings and scan again: the note is a short description from Claude (≤ 30 words, about the object only).
- [ ] Enter a wrong key and scan: the note is marked **LOCAL ANALYSIS** and the toast mentions `auth`.

## Rendering and performance

- [ ] Cycle all five modes: each looks distinct; Thermal shows a warm body and a hot, pulsing face; Night vision brightens a dim room.
- [ ] With the Investigate preset, the FPS readout stays around 30.

## Capture and inputs

- [ ] Snapshot and a short recording both appear on the board; send the clip back to Detective Vision, scrub backwards and forwards, and nothing breaks.
- [ ] Unplug or disable the camera mid-session: the view freezes with **SIGNAL LOST**; plug it back in and it recovers within a few seconds.
- [ ] Block camera permission and reopen the tool: you get a clear message and a list of the case's videos to open instead.

## Board

- [ ] Export a case, delete it, import the file: everything comes back. Import it again and choose "Import as copy": a second, independent case appears.
