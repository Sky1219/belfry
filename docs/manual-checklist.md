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
- [ ] **A straight-off-camera JPEG** (never re-saved): double quantization reads "no sign of two JPEG saves" or "inconclusive", never "consistent with two JPEG saves".
- [ ] Pin every panel: JPEG adds two findings; Error levels and Noise residual each add a map and a finding; Copy-move adds a regions image and a finding when it reads "consistent", and only the finding otherwise. No card claims the photo is fake or authentic.
- [ ] A photo over 40 megapixels is refused with "This photo is over 40 megapixels; Belfry can't analyse it in the browser." and the board stays responsive; a 12 MP photo finishes every panel without freezing the page.
- [ ] **A ~39 MP photo** (just under the limit): every panel finishes, one after another, without the tab crashing or running out of memory (watch the browser's task manager; Ruling R15).

## Fingerprint lab

Take two phone photos of the pad of your own index finger (close up, good light, the ridges sharp), then one of a different finger. Pin them to a case, then pick **Send to Fingerprint lab** from the first one's card menu.

- [ ] **The notice:** the first time in this browser, "Compare your own prints only. Prints are processed on this device and never leave it. This is not an identification." shows before anything is analysed, and print B can't be chosen until **I'm comparing my own prints** is pressed. Reopen the lab: the notice doesn't come back (it does in a private window).
- [ ] **Two photos of the same finger:** pick the second photo as print B. The Match screen reads "Fingerprint match: consistent with the same finger" or "inconclusive", with a score, and the comparison shows both skeletons with the paired minutiae joined in amber (in steel when the verdict isn't "consistent"). Nothing on the screen or the pinned card says "identified", "match confirmed" or "proves".
- [ ] **Different fingers:** **Compare another print**, then the other finger's photo. The Match screen reads "no sign of the same finger" or "inconclusive", never "consistent".
- [ ] The print B picker never lists print A itself.
- [ ] **A photo with no print in it** (a wall, a blank sheet): "Fingerprint match: inconclusive", "not enough ridge detail", the readout `score --`, and a comparison with no pair lines and no matched count.
- [ ] **A photo of a blank wall or paper** (evenly lit, so only sensor noise; and a JPEG straight from the phone): reads "not enough ridge detail" or "too noisy", never a score, and the page stays responsive throughout.
- [ ] **The same finger photographed at a slightly different distance** (hold the phone a little nearer for print B): does not read "no sign of the same finger".
- [ ] **Focus after the notice:** acknowledge it with the keyboard (Tab, then Enter); focus lands on print B's panel (its first row, **Open a photo file**, or **Compare another print**), not the top of the page.
- [ ] Pin the match: a comparison image linked to print A, and a finding linked to the comparison and to print B. The finding card reads `0.nn match score` when it has a score (a score of 0.70 reads `0.70`, as on the panel).
- [ ] Watch the network panel while comparing: no request carries the prints anywhere.

## Steganography lab

Pin a photo from your phone (a JPEG) and a PNG screenshot to a case, then pick **Send to Steganography lab** from the photo's card menu.

- [ ] **A clean photo:** Analyse reads "Hidden data: no sign of sequential LSB embedding" (or "inconclusive"), the ten chi-square bars are steel, and the body ends with "Only detects sequential LSB embedding. Absence of a signal isn't proof of a clean image."
- [ ] **Embed:** switch to **Embed**. The panel says "Saved as PNG: a JPEG save would erase the message." and "Anyone who knows to look can read it; it isn't encrypted." Type a message with an accent or an emoji; the line under it counts bytes, not characters. **Hide and pin** adds "<photo title> — with hidden message" linked to the photo, and the finding "Message hidden (LSB, N bytes)" linked to the image.
- [ ] **Download PNG saves a file that reads back:** after the pin, **Download PNG** is the lit key; press it and a `.png` named after the new image downloads. Drop that file back onto the board as a new file and send it to the lab: Analyse reads "Hidden data: LSB payload found" and shows your message exactly, accents and emoji included.
- [ ] **A canvas-noise browser (Brave with fingerprinting protection on, or Safari in a Private window):** embed a message. Either it pins and its PNG reads back as above, or nothing is pinned and the panel says exactly "This browser changed the picture while saving it, so the message did not survive. Try another browser, or turn off fingerprinting protection for this page." It must never pin a PNG that has lost its message.
- [ ] **A WebP source:** Embed says "Saved as PNG: a lossy WebP save would erase the message."
- [ ] **Re-save it as JPEG:** open the PNG in an image editor, save it as JPEG, add that file and send it to the lab: the message is gone (no "payload found").
- [ ] **A message too long for the image:** type past the capacity on a small image; the byte line turns red, "That message needs N bytes; this image holds M." shows, and the key stays off.
- [ ] **A transparent PNG (a logo or sticker):** embed and read back work; only the opaque pixels count towards the capacity.
- [ ] **A 320 px thumbnail and a screenshot of text:** shrink a phone photo to 320 px wide (saved as PNG), and take a PNG screenshot of a page of black text on white. Neither reads "consistent", and no bar or title turns amber. If one reads "inconclusive", its body says "Text, screenshots, flat graphics and small images can read this high with no hidden message." just before the limit line. (Before the fix, RS alone read 5 of 46 clean 320 px photos and a text page as "consistent".)
- [ ] **A large photo (20 MP or more):** the page stays responsive while Analyse works (the lamp pulses), and switching to Embed and back doesn't start it over.
