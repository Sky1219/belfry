# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences with equal weight:

- **The developer**, working at a desk with a weak laptop webcam and little room to move. Uses Belfry as a personal investigation playground and builds each new tool against real footage.
- **Public visitors** who find the deployed GitHub Pages site. They arrive cold, with no prior context, possibly no Claude API key, and possibly no good camera. Their job is to understand what Belfry is within the first minute, open a case, point a tool at something (live camera or a video file), and see real findings land on the board. First-run clarity is a goal, not an afterthought.

## Product Purpose

Belfry is a browser-based suite of investigation and engineering tools inspired by the detective work in the Batman stories. One **case board** is home base: evidence is pinned to it, sent ("delegated") to a tool, and the tool's findings come back to the board as new, linked evidence.

It is a personal project made public. Success means the code is solid and well tested, every tool is genuinely fun to use, and a visitor who has never heard of it can get from landing to a real finding on the board without help.

## Positioning

Every tool has a real technical core (computer vision, signal processing, simulation, cryptography), never a skin over trivial code and never a minigame. Detective Vision's thermal mode is synthesized from segmentation, face and depth models rather than raw brightness. Its night vision does real multi-frame denoising. Its heart rate uses the POS rPPG method and shows `--` instead of a made-up number. Everything runs locally in the browser, and the board ties every tool together through linked, provenance-tracked evidence.

## Operating Context

- **Core loop:** case list → case board (freeform pinboard + searchable evidence sidebar) → delegate evidence or the live camera to a tool → tool runs full-screen over the board → findings return as linked evidence → export the case as a `.belfry` file.
- **Inputs:** live webcam or a recorded video file, which are equal first-class inputs. No tool may require full-body movement or a lot of space.
- **Keyboard:** Detective Vision preset switching on keys 1–9, `S` to scan the center region.
- **Mock mode:** `?mock` replaces every model with synthetic output, for UI work, tests and visitors without a usable camera.
- **Environment:** desktop browser at a desk. Camera access needs localhost or HTTPS. Models download from Google and Hugging Face CDNs the first time a feature needs them (depth is about 50 MB).

## Capabilities and Constraints

- **Shipped (sub-project 1):** app shell, case list and board, tool registry and interface, media sources, model scheduler, LLM client, IndexedDB evidence store with change log and soft deletes, `.belfry` export/import, and Detective Vision (five vision modes, six overlays, presets, scanning, snapshot and clip capture).
- **Roadmap (order flexible after 1):** image forensics; audio; video "Enhance"; devices (phone cameras over WebRTC, E2E secure channel, which needs a small signaling server); board intelligence (case generator, the Butler voice agent, patrol map); workshop (gadget CAD, FEM stress test, glider lab, circuit bench, drone lab, pursuit planner).
- **Static site, no server** until the devices sub-project decides otherwise. Local-first, sync-ready data.
- **Bring your own Claude API key**, stored only in the browser and called directly from it. Every LLM feature has a non-LLM fallback, and the app must work fully without a key.
- **Graceful degradation:** a missing piece (camera, model, key, storage, GPU) disables one feature with a stated reason, never the whole app.
- **Excluded from the whole suite:** facial recognition or license-plate reading of real people; weapon-like gadget design; trivial shader-only tools or minigames as standalone tools. LLM scan notes describe objects only and never identify or speculate about people.
- **Terminology:** case, case board, evidence (image / video / audio / note / finding), link (derived-from / user), provenance, delegate / "Send to", scan, finding, local analysis, preset, `EV-nn`.

## Brand Commitments

- **Name:** Belfry. Original visuals only, with no DC or Warner Bros. names, logos, fonts or assets. The README may say "inspired by".
- **Voice:** in-app copy is themed after the Batman world wherever possible (the detective's investigation, the cave, the butler, the signal, the patrol, the night watch), written in original words. It never uses trademarked names or catchphrases (Batman, Gotham, Wayne, Alfred, Batcave, Bat-Signal and the like). The existing in-world terms (case board, the Butler, Watchtower, SIGNAL LOST, LOCAL ANALYSIS, EV-nn, presets Investigate / Interrogation / Stakeout / Heat) set the register.
- **Honesty survives the theme:** themed copy never makes a reading sound more certain than it is. Vitals are labelled estimates, not medical readings. A fallback is named as such (`LOCAL ANALYSIS` plus the reason). Unknown values show `--`. Privacy facts (what leaves the browser and when) are stated plainly.

## Evidence on Hand

- Real product docs: `README.md`, `docs/superpowers/specs/2026-10-18-belfry-core-design.md`, `docs/manual-checklist.md`.
- Mock mode provides synthetic demo content (swaying figure, drifting cup, blinking face) for showing features without a camera.
- **Absent, and not to be fabricated:** users, testimonials, usage numbers, benchmarks, press, a logo or mark, and product screenshots. Accuracy claims beyond the spec's own test targets (for example ±3 BPM on synthetic signals) are not established.

## Product Principles

1. **Real technique, honestly reported.** Every effect is backed by an actual method, and the UI says when it doesn't know rather than inventing a value.
2. **The board is home.** Every tool begins from evidence or the camera and ends by putting linked, provenance-tracked findings back on the board.
3. **Works for whoever shows up.** No key, no good camera, no download yet: there is always a path forward (local notes, video files, mock mode), and a cold visitor can see what to do next.
4. **Local and private by default.** Nothing leaves the browser except scan crops sent to Claude with the user's own key, and the UI says so where it matters.
5. **Small desk, real footage.** Designed for a seated user with a weak webcam. Recorded video is never a second-class input.

## Accessibility & Inclusion

Sensible baseline, no formal standard: readable contrast across the dark HUD, full keyboard access to board and tool controls, and respect for `prefers-reduced-motion` in transitions, typewriter reveals and pulses. Camera-feed visuals are exempt from contrast rules, but the HUD text and controls on top of them are not.
