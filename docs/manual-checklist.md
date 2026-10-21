# Manual checklist (real camera, real models)

The automated tests run with a fake camera and mock models, because the development sandbox can't download models. Run through this on your own machine after `npm run dev` (Chrome or Edge; good, even lighting helps).

## Models

- [ ] **First:** with X-ray on, the glowing silhouette covers *you*, not the room around you. (If it's inverted, the segmenter's mask order differs from what Belfry expects — see `models/maskIndex.ts`.)
- [ ] Open a case → **Detective Vision** (in the top rail, or **Open** in the Tools screen). With the Investigate preset, the `SEG`, `DETECT` and `DEPTH` chips reach **READY** (depth only if WebGPU is available or depth is enabled in Settings).
- [ ] Switch to the Interrogation preset (key `2`): `FACE` and `POSE` reach **READY**.
- [ ] Open **Perf**: every active model shows a cost in ms and an interval; nothing says offline.

## Depth after the transformers upgrade

transformers.js went from 3.8 to 4.3. Automated checks only covered the WASM path, in headless Chromium with a synthetic image. Check both runtimes on a real camera:

- [ ] Chrome or Edge with WebGPU: turn depth fog on. `DEPTH` reaches **READY** and fog thickens with distance (your hand close to the lens stays clear; the far wall fogs). In DevTools → Network, the model file is `model_fp16.onnx`.
- [ ] In a browser without WebGPU (`'gpu' in navigator` is `false` in the console), with depth enabled in Settings: the same check. Network should show `model_quantized.onnx` and `ort-wasm-simd-threaded.asyncify.wasm` loading from jsdelivr.
- [ ] Reload: the second load comes from cache (no model download in Network) and reaches READY within a few seconds.
- [ ] Wave a hand for 30 s with depth on: video stays smooth and the Perf panel shows depth at its own interval, with no console errors from `depth.worker`.

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
- [ ] Block camera permission and reopen the tool: **No signal** explains why and offers the case's videos, **Open a video file** and **Run the demo feed** (lit when the case has no footage). The demo feed runs with the mock models and scans the drifting cup.

## Board

- [ ] Export a case, delete it, import the file: everything comes back. Import it again and choose "Import as copy": a second, independent case appears.

## First run and the board (new in the monitor-wall pass)

- [ ] In a fresh browser profile, Belfry opens straight into the staged case **The Silent Bell**, with **Your move** selected and readable; the **Detective Vision** key in the rail is lit until you open a tool once.
- [ ] Drag a photo, a short phone video and a text file onto the board: the photo and video pin as exhibits (video with a thumbnail), the text file is left out with a reason in a toast.
- [ ] Scan something with links already on the board: the crop and its finding land clear of every link and label, the finding sits right beside its crop, and back on the board the newest one is selected and in view.
- [ ] Remove an exhibit, then press **Ctrl+Z** (Cmd+Z on a Mac): it comes back with its links.
- [ ] Type in the evidence search: non-matching cards dim on the board; clear it and they return.
- [ ] Select an image or video exhibit: its feed in the **Feeds** screen goes full color with a red frame; pick the feed again to let go.
- [ ] Zoom the board out past 70%: cards collapse to stamp and title; open a card's **···** menu while zoomed out and it appears at full size.
- [ ] Tab through the board with a screen reader on: cards read as "Exhibit 3, note: …", links are reached from **Links…** in a card's menu, and every dialog traps focus and returns it on Escape.
- [ ] On a phone (or a 390px-wide window): the rail shows **Note / Files / Vision / Index / Gauges**, the board opens legibly on the case's next step, and both drawers open and close.
- [ ] Settings: **Remember key on this device** starts off; with it off, the key is gone after closing the tab.
## Index as reading surface and No Signal (tool platform pass)

- [ ] Phone width: open the evidence drawer, tap a long note. The row opens to the full text with no clamp, and its actions (Edit, Remove, Link to…) work from the drawer.
- [ ] Pin an audio file, select it: the open row plays it with the browser's controls.
- [ ] Open Detective Vision with the camera blocked in a case that has footage: No Signal lists the footage, and "Open a video file" pins the file to the board before the tool opens on it.
- [ ] Keyboard only: Tab to an index row, press Enter. The row reports itself expanded, and Tab reaches its actions next.

## Photo forensics

Open a case → **Photo forensics** in the rail → **Open a photo file**. Each panel finishes on its own, and every pin lands beside the photo, linked derived-from.

- [ ] **A real phone JPEG** (straight off the phone, not sent through a messaging app): Metadata lists the make, model, date taken and, if location was on, a position (the pinned finding's detail is a location). JPEG reads a quality, or "non-standard tables" for phones that use their own. A portrait photo shows upright, and the error level and noise maps line up with it.
- [ ] **A screenshot (PNG):** the JPEG panel says "Not a JPEG: quantization tests don't apply." with no quality number and no pin; nothing on the screen reads NaN.
- [ ] **A Photoshop-edited JPEG** (open a photo, clone-stamp an area, save as JPEG): Metadata's Software line names Photoshop; double quantization reads "consistent with two JPEG saves" or "inconclusive"; a large clone-stamped area shows as amber marks on the photo with "Copy-move: consistent with cloned regions".
- [ ] Pin every panel: JPEG adds two findings; Error levels, Noise residual and Copy-move each add a map and a finding. No card claims the photo is fake or authentic.
- [ ] A photo over 40 megapixels is refused with "This photo is over 40 megapixels; Belfry can't analyse it in the browser." and the board stays responsive; a 12 MP photo finishes every panel without freezing the page.
