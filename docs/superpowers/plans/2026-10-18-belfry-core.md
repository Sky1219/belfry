# Belfry Core + Detective Vision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `detective-vision` prototype into Belfry: a React app with a persistent case board, a tool interface, shared platform services, and a full Detective Vision tool (5 vision modes, 7 overlays, presets, vitals, scanning, capture).

**Architecture:** React shell (case list, pinboard, settings, tool host) over framework-free TypeScript platform services (frame sources, model scheduler, LLM client, evidence store on IndexedDB with a change log). Detective Vision is the first tool behind a manifest-based tool interface; its renderer, models, and signal processing are plain TS mounted inside one React component.

**Tech Stack:** Vite 6, TypeScript 5, React 19, `@xyflow/react` 12 (pinboard), Dexie 4 (IndexedDB), `fflate` (zip), `ulid`, `@mediapipe/tasks-vision` 0.10.21, `@huggingface/transformers` 3 (depth, in a worker), Vitest 3 + `fake-indexeddb` (unit), `@playwright/test` 1.56.x (browser tests, Chromium from `PLAYWRIGHT_BROWSERS_PATH`).

**Spec:** `docs/superpowers/specs/2026-10-18-belfry-core-design.md`

## Global Constraints

- Product name **Belfry**. No DC/Warner Bros names, logos, fonts or assets anywhere in code, UI copy, or assets. README may say "inspired by".
- Static site only (GitHub Pages); Vite `base: "./"`. No server code.
- Every camera feature must also work on a video evidence item.
- LLM: Claude Messages API, model `claude-haiku-5-5`, key from settings stored only in this browser, called directly from the browser. Every LLM feature has a non-LLM fallback.
- IDs are ULIDs. Deletes are soft (`deleted: true`). Every write appends a change-log entry `{ seq, recordType, recordId, op: "put" | "delete", at }`.
- Export format: `.belfry` zip with `manifest.json` (`formatVersion: 1`, case record), `records.json` (evidence, links), `blobs/<sha256>`.
- Scheduler target 30 fps. Default intervals (frames): segmentation 1, face 1, pose 2, detection 3, depth 10 (async, worker).
- Depth: WebGPU → `dtype: "fp16"`, on by default; otherwise WASM → `dtype: "q8"`, off by default. Model `onnx-community/depth-anything-v2-small`.
- Heart rate band 0.7–3.0 Hz (42–180 BPM), ~10 s window, no reading before 6 s of stable signal; shown as an estimate with confidence.
- Scan: 2 s dwell under reticle; click = immediate; `S` scans center region; 10 s per-track cooldown; crop = box + 15% padding, long side ≤ 512 px, JPEG, from the unstylized source frame. LLM note ≤ 30 words, object only, never identify or speculate about people. API failure → local note marked `LOCAL ANALYSIS` with the reason.
- Tracker drops a track after 0.5 s unseen. Evidence classes: cell phone, bottle, cup, wine glass, book, laptop, remote, keyboard, mouse, scissors, knife, backpack, handbag, umbrella, clock, vase, teddy bear, toothbrush, fork, spoon, sports ball. Never `person`.
- Clip recording ≤ 30 s, WebM via `MediaRecorder`.
- `?mock` in the URL replaces every model with synthetic output.
- Model URLs:
  - segmenter `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`
  - pose `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`
  - detector `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite`
  - face `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task`
  - MediaPipe WASM is served locally from `public/mediapipe/wasm` (copied from `node_modules/@mediapipe/tasks-vision/wasm` by a `postinstall` script; git-ignored).

## Review Focus

1. **Portrait or odd-aspect video** (phone clips, 9:16, 4:3 webcams): the image must cover-fit without stretching and every overlay (boxes, skeleton, reticle, click targets) must line up with the pixels under it. Pinned in Task 7 (`viewport` tests with 9:16 and 4:3 sources, mirrored and not).
2. **Seeking or looping a video backwards**: MediaPipe `VIDEO` mode throws on non-increasing timestamps; scrubbing back must keep everything running. Pinned in Task 7 (`MonotonicClock` test) and used by every model call in Task 10.
3. **Tab hidden or frames stalled for seconds**: the heart-rate buffer must reset across a gap rather than splice two signals into a fake reading. Pinned in Task 12 (`gap > 1 s resets` test).
4. **Importing a case that already exists, twice**: "import as copy" must give every record a new ID and remap every link and provenance reference so the copy's graph is intact and independent. Pinned in Task 3.
5. **API key pasted with whitespace, or a key that is rejected / returns an empty or odd response**: key is trimmed; 401/429/network/empty-content each produce a typed error and the scan still lands with a local note. Pinned in Task 5 and Task 15.

---

## File Structure

```
src/
  main.tsx                     React entry
  app/App.tsx                  routes: case list / board / tool
  app/router.ts                hash routes (pure)
  app/settings.ts              localStorage-backed settings (API key + per-tool settings)
  app/SettingsPanel.tsx
  ui/theme.css                 HUD design tokens + base styles
  ui/components.tsx            Panel, HudButton, StatusChip, ProgressRing, Toggle
  store/schema.ts              record types
  store/db.ts                  Dexie database
  store/store.ts               EvidenceStore (CRUD, links, soft delete, change log, subscribe)
  store/blobs.ts               sha256 + put/get blob + thumbnails
  store/exportImport.ts        .belfry export / import
  board/CaseList.tsx
  board/Board.tsx              React Flow pinboard
  board/EvidenceCard.tsx
  board/Sidebar.tsx
  board/placement.ts           where new evidence lands (pure)
  tools/types.ts               ToolManifest, ToolContext, EvidenceInput
  tools/registry.ts
  tools/ToolHost.tsx
  platform/media/frameSource.ts   FrameSource interface + MonotonicClock
  platform/media/webcam.ts
  platform/media/videoFile.ts
  platform/viewport.ts         cover-fit + mirroring mapping
  platform/scheduler.ts        adaptive ModelScheduler
  platform/llm.ts              LlmClient
  tools/detective/
    manifest.ts
    DetectiveView.tsx          React host: canvases + HUD controls
    engine.ts                  per-frame loop wiring everything
    presets.ts                 modes, overlays, built-in presets
    gl/renderer.ts             WebGL2 setup, textures, ping-pong, pass dispatch
    gl/shaders/common.ts       shared GLSL (luma, sobel, sampling helpers, uniforms)
    gl/shaders/detective.ts  thermal.ts  night.ts  motion.ts  normal.ts  history.ts
    models/mediapipe.ts        shared FilesetResolver, GPU→CPU fallback
    models/segmenter.ts  pose.ts  detector.ts  face.ts
    models/depth.ts  depth.worker.ts
    models/mock.ts             synthetic outputs for ?mock
    models/manager.ts          lazy load per feature, status per model
    features/tracker.ts
    features/rppg.ts           POS + spectral estimate
    features/vitals.ts         blink (EAR) + gaze
    features/color.ts          dominant color naming
    features/localNote.ts
    features/scan.ts           dwell state machine + crop geometry
    features/forensics.ts      LLM note + fallback → evidence
    overlay/overlay.ts         2D canvas drawing
    capture.ts                 snapshot + clip
tests/unit/**.test.ts          Vitest
tests/e2e/**.spec.ts           Playwright
scripts/copy-wasm.mjs
```

The prototype's `src/gl/*`, `src/models/*`, `src/main.ts`, `src/style.css` are replaced by this structure in Tasks 1 and 9.

---

### Task 1: React shell, HUD design system, test tooling

**Files:**
- Create: `src/main.tsx`, `src/app/App.tsx`, `src/app/router.ts`, `src/ui/theme.css`, `src/ui/components.tsx`, `scripts/copy-wasm.mjs`, `vitest.config.ts`, `playwright.config.ts`, `tests/unit/router.test.ts`, `tests/e2e/smoke.spec.ts`
- Modify: `package.json` (name `belfry`, deps, scripts), `index.html` (title "Belfry", root div, no prototype markup), `.gitignore` (add `public/mediapipe`, `test-results`, `playwright-report`, `.superpowers`), `tsconfig.json` (`jsx: "react-jsx"`, include `tests`)
- Delete: `src/main.ts`, `src/style.css` (prototype entry; `src/gl` and `src/models` stay until Task 9 moves them)

**Interfaces:**
- Produces: `type Route = { name: "cases" } | { name: "board"; caseId: string } | { name: "tool"; caseId: string; toolId: string; input: string }`; `parseRoute(hash: string): Route`; `formatRoute(r: Route): string`; `useRoute(): [Route, (r: Route) => void]`. UI components `Panel`, `HudButton`, `StatusChip({ state: "loading" | "ready" | "offline" | "off" })`, `ProgressRing({ value: number })`, `Toggle`.
- Scripts: `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest run`), `test:e2e` (`playwright test`), `postinstall` (`node scripts/copy-wasm.mjs`).

- [ ] **Step 1: Install dependencies**

Run: `npm i react@19 react-dom@19 @xyflow/react@12 dexie@4 fflate ulid && npm i -D @types/react @types/react-dom @vitejs/plugin-react fake-indexeddb @playwright/test@1.56 jsdom`
Expected: installs without errors; `node_modules/@mediapipe/tasks-vision/wasm` exists.

- [ ] **Step 2: Write the failing router test** in `tests/unit/router.test.ts`

```ts
test("parses and formats every route", () => {
  for (const r of [
    { name: "cases" },
    { name: "board", caseId: "01J0ABC" },
    { name: "tool", caseId: "01J0ABC", toolId: "detective-vision", input: "live-camera" },
  ] as const) expect(parseRoute(formatRoute(r))).toEqual(r);
});
test("unknown or empty hash falls back to cases", () => {
  expect(parseRoute("")).toEqual({ name: "cases" });
  expect(parseRoute("#/nonsense/x")).toEqual({ name: "cases" });
});
```

- [ ] **Step 3: Run it** — `npx vitest run tests/unit/router.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `router.ts` (hash form `#/`, `#/case/<id>`, `#/case/<id>/tool/<toolId>/<input>`; `input` URI-encoded), `copy-wasm.mjs`, theme tokens (cyan `#59d9ff` on `#02060d`, JetBrains Mono with `ui-monospace` fallback, orange accent `#ffa040` for evidence), components, and `App.tsx` rendering a placeholder per route. `vite.config.ts` adds `@vitejs/plugin-react`; worker format `es`.

- [ ] **Step 5: Run unit test** → Expected: PASS 2/2.

- [ ] **Step 6: Write e2e smoke test** `tests/e2e/smoke.spec.ts`: page loads, title is `Belfry`, no console errors. `playwright.config.ts`: `webServer: { command: "npm run build && npx vite preview --port 4173", port: 4173 }`, Chromium launch args `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.

- [ ] **Step 7: Run** `npm run test:e2e` → Expected: 1 passed.

- [ ] **Step 8: Commit** — `feat: React shell, HUD design system, test tooling`

---

### Task 2: Evidence store

**Files:**
- Create: `src/store/schema.ts`, `src/store/db.ts`, `src/store/store.ts`, `tests/unit/store.test.ts`

**Interfaces:**
- Produces (schema): `Case { id; title; status: "open" | "closed"; createdAt; updatedAt; deleted }`; `Evidence { id; caseId; type: "image" | "video" | "audio" | "note" | "finding"; title; body?; tags: string[]; blobHash?; thumbHash?; provenance: { toolId?; sourceEvidenceId?; createdAt }; position: { x; y }; meta: Record<string, unknown>; createdAt; updatedAt; deleted }`; `Link { id; caseId; fromId; toId; kind: "derived-from" | "user"; label?; createdAt; deleted }`; `ChangeEntry { seq; recordType: "case" | "evidence" | "link" | "blob"; recordId; op: "put" | "delete"; at }`. Timestamps are epoch ms.
- Produces (store): `class EvidenceStore { static open(name = "belfry"): Promise<EvidenceStore>; createCase(title): Promise<Case>; listCases(): Promise<Case[]>; updateCase(id, patch): Promise<Case>; deleteCase(id); addEvidence(input: NewEvidence): Promise<Evidence>; updateEvidence(id, patch); deleteEvidence(id); listEvidence(caseId): Promise<Evidence[]>; addLink(input: NewLink): Promise<Link>; deleteLink(id); listLinks(caseId): Promise<Link[]>; changes(sinceSeq = 0): Promise<ChangeEntry[]>; subscribe(caseId, fn: () => void): () => void }` where `NewEvidence` = Evidence minus id/timestamps/deleted (with `tags`, `meta`, `position` optional). List methods exclude soft-deleted records. `deleteEvidence` also soft-deletes its links. `deleteCase` soft-deletes everything in it.
- Produces: `class MemoryFallbackError` — `open()` resolves to an in-memory store (Dexie on `fake-indexeddb`) when IndexedDB is unavailable and sets `store.persistent = false`.

- [ ] **Step 1: Write failing tests** (use `import "fake-indexeddb/auto"` and a fresh DB name per test):
  - `creates a case and lists it` (status `open`, ULID id matching `/^[0-9A-HJKMNP-TV-Z]{26}$/`)
  - `adds evidence with defaults` (`tags: []`, `meta: {}`, `position: {x:0,y:0}`)
  - `deleteEvidence soft-deletes it and its links` (gone from lists; raw table row has `deleted: true`)
  - `every write appends a change entry in order` (create case, add evidence, delete evidence → ops `put, put, delete` with increasing `seq`)
  - `subscribe fires on writes to that case only, and unsubscribe stops it`
  - `falls back to memory when indexedDB is undefined` (`persistent === false`, CRUD still works)

- [ ] **Step 2: Run** `npx vitest run tests/unit/store.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** Dexie tables `cases`, `evidence` (index `caseId`), `links` (index `caseId`), `blobs` (key `hash`), `changes` (`++seq`). Each write and its change entry in one Dexie transaction. Subscribe via an in-process event emitter keyed by caseId.

- [ ] **Step 4: Run** → Expected: PASS 6/6.

- [ ] **Step 5: Commit** — `feat: evidence store with change log and soft deletes`

---

### Task 3: Blobs and .belfry export/import

**Files:**
- Create: `src/store/blobs.ts`, `src/store/exportImport.ts`, `tests/unit/exportImport.test.ts`
- Modify: `src/store/store.ts` (expose `putBlob`, `getBlob`)

**Interfaces:**
- Consumes: `EvidenceStore` (Task 2).
- Produces: `sha256Hex(bytes: Uint8Array): Promise<string>`; `store.putBlob(bytes: Uint8Array, mime: string): Promise<string /* hash */>` (idempotent); `store.getBlob(hash): Promise<{ bytes: Uint8Array; mime: string } | undefined>`; `makeThumbnail(blob: Blob, maxSide = 256): Promise<Uint8Array>` (browser-only, JPEG); `exportCase(store, caseId): Promise<Uint8Array>`; `importCase(store, bytes, mode: "replace" | "copy"): Promise<Case>`; `peekImport(bytes): Promise<{ caseId: string; exists: boolean }>`; `class ImportError extends Error { reason: "not-zip" | "bad-version" | "bad-structure" | "missing-blob" }`.

- [ ] **Step 1: Write failing tests:**
  - `putBlob dedupes identical bytes` (same hash, one row)
  - `export → import(replace) into an empty DB yields identical case, evidence, links, and blob bytes`
  - `import as copy assigns new ids and remaps links and provenance` (Review Focus 4): import the same file twice with `"copy"`; three cases total; every copied link's `fromId`/`toId` and every `provenance.sourceEvidenceId` points inside its own copy; deleting evidence in one copy leaves the other intact
  - `rejects wrong formatVersion with reason bad-version and writes nothing` (record counts unchanged)
  - `rejects a zip missing a referenced blob with reason missing-blob and writes nothing`
  - `rejects random bytes with reason not-zip`

- [ ] **Step 2: Run** `npx vitest run tests/unit/exportImport.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implement** with `fflate` `zipSync`/`unzipSync`. Validate the entire archive in memory before opening a write transaction; the whole import is one transaction. Soft-deleted records are not exported.

- [ ] **Step 4: Run** → Expected: PASS 6/6.

- [ ] **Step 5: Commit** — `feat: content-addressed blobs and .belfry export/import`

---

### Task 4: Case list, pinboard, sidebar

**Files:**
- Create: `src/board/CaseList.tsx`, `src/board/Board.tsx`, `src/board/EvidenceCard.tsx`, `src/board/Sidebar.tsx`, `src/board/placement.ts`, `tests/unit/placement.test.ts`, `tests/e2e/board.spec.ts`
- Modify: `src/app/App.tsx` (render real screens; provide the store via React context `StoreContext`)

**Interfaces:**
- Consumes: `EvidenceStore`, `Route`/`useRoute`.
- Produces: `nextPosition(existing: {x:number;y:number}[], near?: {x:number;y:number}): {x:number;y:number}` — returns the first free slot on a 260×200 grid spiralling out from `near` (default origin) that no existing card occupies. `placeNear(existing, anchor, count): {x;y}[]` for multi-item findings (side by side, right of anchor). `StoreContext`.
- UI behavior: case list (create, open, close/reopen, delete with confirm, export button per case, import button — when `peekImport` reports the case already exists, ask "Replace" or "Import as copy"; `ImportError` reasons shown as plain messages); board = React Flow with `EvidenceCard` nodes (type icon, title, thumbnail when `thumbHash`, tags, body preview), edges for links (derived-from dashed, user solid), drag persists `position` on drag end, connect handles create `user` links, "Add note" creates `note` evidence, card menu: rename, edit tags, delete, "Send to →" (filled in Task 6). Sidebar: search over title/body/tags, type filter, click centers the card.

- [ ] **Step 1: Write failing placement tests:** `first slot is the origin`; `skips occupied slots`; `spirals around a near point`; `placeNear returns count distinct free slots right of the anchor`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/placement.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement** `placement.ts`, then the screens.
- [ ] **Step 4: Run** → Expected: PASS 4/4.
- [ ] **Step 5: Write e2e** `tests/e2e/board.spec.ts`: create case "Test Case" → add two notes → connect them → drag one → reload page → both notes, the link, and the dragged position persist → sidebar search for the second note's title shows only it → export, delete case, import file → case is back with both notes.
- [ ] **Step 6: Run** `npm run test:e2e -- board` → Expected: PASS.
- [ ] **Step 7: Commit** — `feat: case list, pinboard and evidence sidebar`

---

### Task 5: LLM client

**Files:**
- Create: `src/platform/llm.ts`, `tests/unit/llm.test.ts`

**Interfaces:**
- Produces: `class LlmClient { constructor(getKey: () => string, fetchImpl = fetch); available(): boolean; describeImage(args: { jpegBase64: string; system: string; prompt: string; maxTokens?: number /* 120 */ }): Promise<string> }`; `class LlmError extends Error { kind: "no-key" | "auth" | "rate-limit" | "network" | "bad-response" | "server" }`.
- Request: `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`, `content-type: application/json`; body `{ model: "claude-haiku-5-5", max_tokens, system, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }, { type: "text", text: prompt }] }] }`. Result = concatenated `text` blocks, trimmed. Timeout 15 s via `AbortController` → `network`.

- [ ] **Step 1: Write failing tests** with a fake fetch: `sends the exact headers, model and image block`; `available() is false for empty or whitespace key`; `trims the key in the header`; `401 → auth`; `429 → rate-limit`; `500 → server`; `fetch throws → network`; `timeout → network`; `no text blocks or empty text → bad-response` (Review Focus 5).
- [ ] **Step 2: Run** `npx vitest run tests/unit/llm.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → Expected: PASS 9/9.
- [ ] **Step 5: Commit** — `feat: Claude client with typed errors`

---

### Task 6: Tool interface, tool host, settings

**Files:**
- Create: `src/tools/types.ts`, `src/tools/registry.ts`, `src/tools/ToolHost.tsx`, `src/app/settings.ts`, `src/app/SettingsPanel.tsx`, `tests/unit/registry.test.ts`, `tests/unit/settings.test.ts`
- Modify: `src/board/EvidenceCard.tsx` ("Send to →" menu), `src/board/Board.tsx` (toolbar "Open tool → live camera"), `src/app/App.tsx` (tool route → `ToolHost`; settings button)

**Interfaces:**
- Produces: `type EvidenceInput = "live-camera" | "image" | "video" | "audio"`; `interface ToolManifest { id; name; accepts: EvidenceInput[]; load(): Promise<ToolComponent>; loadSettingsSection?(): Promise<React.ComponentType> }` (lazy imports; the optional section renders inside SettingsPanel under the tool's name); `type ToolComponent = React.ComponentType<{ ctx: ToolContext }>`; `interface ToolContext { caseId: string; input: { kind: "live-camera" } | { kind: "evidence"; evidence: Evidence }; store: EvidenceStore; llm: LlmClient; settings: Settings; close(): void }`; `registerTool(m)`, `listTools()`, `toolsAccepting(input: EvidenceInput): ToolManifest[]` (evidence `video` → `"video"`, `image` → `"image"`, etc.; `note`/`finding` → none). Route `input` param is `live-camera` or `ev:<evidenceId>`.
- Produces: `interface Settings { apiKey: string; tools: Record<string, unknown> }`; `loadSettings(): Settings`; `saveSettings(s)`; `getToolSettings<T>(s: Settings, toolId: string, defaults: T): T` (shallow-merges stored over defaults); `setToolSettings(s, toolId, value): Settings`. All storage access wraps `localStorage` in try/catch (falls back to in-memory). `apiKey` is trimmed on save (Review Focus 5). ToolHost builds `new LlmClient(() => settings.apiKey)` (Task 5).
- SettingsPanel: API key field (password input, "stored only in this browser" note, clear button), each registered tool's settings section, storage usage (`navigator.storage.estimate()`), "Import case" button (same flow as the case list).
- App-wide banners: `store.persistent === false` → "Cases won't be saved in this browser"; storage usage / quota > 0.9 → "Storage almost full — export old cases".

- [ ] **Step 1: Write failing tests:** `toolsAccepting filters by input`; `note and finding evidence map to no tools`; `settings round-trip`; `apiKey is trimmed`; `settings survive a throwing localStorage` (stub that throws → defaults returned, no exception); `getToolSettings merges stored values over defaults`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/registry.test.ts tests/unit/settings.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement.** ToolHost: full-screen layer over the board, Esc/close button returns to the board route, loads the tool lazily with a "LOADING TOOL" state.
- [ ] **Step 4: Run** → Expected: PASS 6/6.
- [ ] **Step 5: Commit** — `feat: tool interface, tool host and settings`

---

### Task 7: Frame sources, monotonic clock, viewport mapping

**Files:**
- Create: `src/platform/media/frameSource.ts`, `src/platform/media/webcam.ts`, `src/platform/media/videoFile.ts`, `src/platform/viewport.ts`, `tests/unit/viewport.test.ts`, `tests/unit/clock.test.ts`

**Interfaces:**
- Produces: `interface FrameSource { readonly element: HTMLVideoElement; readonly width: number; readonly height: number; readonly kind: "live" | "file"; frameId(): number /* increments per new decoded frame */; status(): "ok" | "lost"; onStatus(fn): () => void; play?(); pause?(); seek?(t: number); duration?: number; currentTime(): number; dispose(): void }`. `openWebcam(): Promise<FrameSource>` throws `CameraError { reason: "denied" | "not-found" | "other" }`; on track `ended` → status `lost`, retries `getUserMedia` every 2 s and returns to `ok`. `openVideo(blob: Blob): Promise<FrameSource>` (loops). New-frame detection uses `requestVideoFrameCallback` when present, else `currentTime` change.
- Produces: `class MonotonicClock { next(sourceMs: number): number }` — returns a strictly increasing ms value: `max(sourceMs + offset, last + 1)`, where `offset` jumps forward when the source goes backwards (Review Focus 2).
- Produces: `interface Viewport { scale: number; offsetX: number; offsetY: number; mirror: boolean; srcW; srcH; dstW; dstH }`; `coverFit(srcW, srcH, dstW, dstH, mirror): Viewport`; `toScreen(v, nx, ny): {x;y}` (normalized source → CSS px); `toSource(v, x, y): {nx;ny}`; `shaderUv(v): { scale: [number, number]; offset: [number, number] }` so the shader computes `srcUv = screenUv * scale + offset`, then mirrors x when `mirror`.

- [ ] **Step 1: Write failing tests:**
  - `coverFit fills the destination without stretching` for 16:9→16:9, 4:3→16:9, 9:16→16:9 (Review Focus 1): displayed size covers dst, aspect preserved, centered
  - `toSource inverts toScreen` for all three aspects × mirror on/off on a 5×5 grid of points
  - `mirroring flips x only`
  - `shaderUv maps screen corners to the visible source rectangle` (compare with `toSource` on the four corners)
  - `MonotonicClock stays strictly increasing across a backwards seek and a loop`: inputs `[0, 33, 66, 10, 43, 0]` → strictly increasing outputs
- [ ] **Step 2: Run** `npx vitest run tests/unit/viewport.test.ts tests/unit/clock.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → Expected: PASS 5/5.
- [ ] **Step 5: Commit** — `feat: frame sources, monotonic clock and viewport mapping`

---

### Task 8: Adaptive model scheduler

**Files:**
- Create: `src/platform/scheduler.ts`, `tests/unit/scheduler.test.ts`
- Delete: `src/models/scheduler.ts` (prototype)

**Interfaces:**
- Produces: `interface TaskSpec { name: string; priority: number /* higher = more important */; defaultInterval: number; maxInterval: number; run(frame: number, timeMs: number): void | Promise<void> }`; `class ModelScheduler { constructor(opts?: { targetFps?: number /* 30 */; adaptEveryMs?: number /* 1000 */; now?: () => number }); add(spec); remove(name); setActive(name, active: boolean); onNewFrame(frame: number, timeMs: number): void; reportFrameTime(ms: number): void; stats(): Array<{ name; interval; avgMs; active; inFlight }> }`.
- Policy: a task runs when active, not in flight, and `frame - lastRunFrame >= interval`. `avgMs` is an EMA (α = 0.1) of each run's duration (sync, or until its promise settles). Every `adaptEveryMs`, using an EMA of reported frame times: if > `1000/targetFps × 1.1`, the lowest-priority active task with `interval < maxInterval` gets `interval + 1`; if < `1000/targetFps × 0.8`, the highest-priority active task with `interval > defaultInterval` gets `interval − 1`. A rejected promise counts as a finished run and is logged once per task.

- [ ] **Step 1: Write failing tests** (fake `now`): `runs each task at its interval`; `inactive tasks never run`; `async task is not re-entered while in flight`; `backs off the lowest-priority task when frames are slow`; `recovers the highest-priority task when frames are fast, never below default`; `never exceeds maxInterval`; `rejected async run is treated as finished`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/scheduler.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → Expected: PASS 7/7.
- [ ] **Step 5: Commit** — `feat: adaptive model scheduler`

---

### Task 9: Renderer — modes, transitions, multi-frame buffers

**Files:**
- Create: `src/tools/detective/gl/renderer.ts`, `src/tools/detective/gl/shaders/{common,detective,thermal,night,motion,normal,history}.ts`, `src/tools/detective/presets.ts`, `tests/unit/presets.test.ts`, `tests/e2e/shaders.spec.ts`, `src/tools/detective/dev/ShaderHarness.tsx` (route `#/dev/shaders`, only when `?mock`)
- Delete: `src/gl/` (prototype)

**Interfaces:**
- Consumes: `Viewport`/`shaderUv` (Task 7).
- Produces (presets): `type ModelName = "segmentation" | "face" | "pose" | "detection" | "depth"`; `type VisionMode = "detective" | "thermal" | "night" | "motion" | "normal"`; `type Overlay = "xray" | "skeleton" | "evidence" | "vitals" | "depthFog" | "ghostTrails"`; `type HudDensity = "full" | "minimal" | "off"`; `type ThermalPalette = "ironbow" | "white-hot" | "black-hot"`; `interface PresetDef { id; name; mode; overlays: Overlay[]; palette: ThermalPalette; hud: HudDensity }`; `BUILTIN_PRESETS` = Investigate (detective; xray, evidence, depthFog), Interrogation (normal; vitals, skeleton), Stakeout (night; evidence, ghostTrails), Heat (thermal; vitals); `requiredModels(mode, overlays, depthEnabled: boolean): Set<ModelName>` — xray/ghostTrails/thermal → segmentation; vitals/thermal → face; skeleton → pose; evidence → detection (scanning also needs detection, so detection is always required while the tool is open); depthFog and thermal → depth, but only when `depthEnabled`. `interface DetectiveSettings { defaultPresetId: string; customPresets: PresetDef[]; depthEnabled: boolean }` with defaults `{ defaultPresetId: "investigate", customPresets: [], depthEnabled: "gpu" in navigator }`, stored via `getToolSettings`/`setToolSettings` (Task 6).
- Produces (renderer): `class Renderer { constructor(canvas: HTMLCanvasElement); setSource(el: HTMLVideoElement): void; setMask(data: Float32Array, w, h); setDepth(data: Uint8Array, w, h); setBoxes(boxes: Array<[x0,y0,x1,y1]> /* normalized, max 8 */); setFace(box: [x0,y0,x1,y1] | null, pulse01: number); setViewport(v: Viewport); render(state: { mode; prevMode; transition01: number; overlays: Set<Overlay>; palette; timeS: number; hasNewFrame: boolean }): void; readPixels(): ImageData; dispose() }`; static `Renderer.compileAll(gl)` used by the harness to compile every program and throw on any error.
- Behavior: each mode is a fragment program sharing `common.ts` uniforms. Multi-frame state (night-vision accumulation, motion history, ghost-trail mask history) lives in `history.ts` ping-pong RGBA8 framebuffers updated only when `hasNewFrame`. Transition: render prev and new mode, blend with the radial pulse ring (prototype math). Per-pixel overlays (xray, depth fog, ghost trails, evidence edge tint in orange inside boxes) are uniforms applied in every mode program. Thermal per spec §5.2 (person heat from mask, face hotter, face intensity × `0.85 + 0.15·pulse01`, background cools with depth when present; three palettes as 1D gradient functions). Night per spec §5.2 (exponential accumulation α = 0.25, auto-gain targeting mean luma 0.45, gamma, green tint, grain, bloom from a 9-tap threshold blur). Motion: |luma − previous luma| > 0.06 written into a history buffer decaying by 0.92 per frame, shown as heat on dark. Depth keeps previous and current textures and crossfades over 300 ms after each `setDepth`.

- [ ] **Step 1: Write failing preset tests:** `requiredModels for each built-in preset with depth enabled` (Investigate → segmentation, detection, depth; Interrogation → face, pose, detection; Stakeout → segmentation, detection; Heat → segmentation, face, detection, depth); `depth is never required when depth is disabled`; `normal mode with no overlays needs only detection`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/presets.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement** presets, shaders, renderer, harness (renders the Chromium fake-camera stream with a synthetic elliptical mask, a gradient depth map, one box, and a face box, cycling `?mode=`).
- [ ] **Step 4: Run** → Expected: PASS 3/3.
- [ ] **Step 5: Write e2e** `tests/e2e/shaders.spec.ts`: open `/?mock#/dev/shaders`; every program compiles (harness exposes `window.__shaderErrors`, expected `[]`); for each mode, screenshot to `test-results/mode-<mode>.png` and assert the frame is not uniform (pixel variance > threshold) and differs from the `normal` frame.
- [ ] **Step 6: Run** `npm run test:e2e -- shaders` → Expected: PASS. Open each screenshot with the Read tool and check it looks like the spec's description; record a sentence per mode in the ledger.
- [ ] **Step 7: Commit** — `feat: WebGL renderer with five vision modes and transitions`

---

### Task 10: Model wrappers, manager, mock models

**Files:**
- Create: `src/tools/detective/models/{mediapipe,segmenter,pose,detector,face,depth,depth.worker,mock,manager}.ts`, `tests/unit/manager.test.ts`, `tests/unit/mock.test.ts`
- Delete: `src/models/` (prototype)

**Interfaces:**
- Consumes: `MonotonicClock` (Task 7), `ModelScheduler` (Task 8).
- Produces model output types: `Mask { data: Float32Array; width; height }`; `PoseResult { landmarks: Array<{x;y;z;visibility}> } | null` (33 points, normalized); `Detection { label: string; score: number; box: [x0,y0,x1,y1] /* normalized */ }`; `FaceResult { landmarks: Array<{x;y;z}>; box: [x0,y0,x1,y1] } | null` (478 points incl. iris); `DepthMap { data: Uint8Array; width; height }` (bright = near).
- Produces: `interface ModelAdapter<T> { name: ModelName; load(): Promise<void>; infer(source: HTMLVideoElement, tMs: number): T | Promise<T>; dispose() }`, one per model, each calling MediaPipe `*ForVideo` with a per-model `MonotonicClock`. `createFileset()` (shared, WASM from `new URL("mediapipe/wasm", document.baseURI)`); each MediaPipe adapter tries `delegate: "GPU"` then `"CPU"`. Depth adapter posts a 256-px-wide `ImageBitmap` to `depth.worker.ts` (Transformers.js `pipeline("depth-estimation", "onnx-community/depth-anything-v2-small", { device, dtype })` per Global Constraints) and resolves with the `depth` RawImage bytes.
- Produces: `class ModelManager { constructor(adapters: Record<ModelName, ModelAdapter<any>>); ensure(names: Set<ModelName>): void /* starts loading any not yet loading */; status(name): "off" | "loading" | "ready" | "offline"; onStatus(fn): () => void; retry(name); get<T>(name): ModelAdapter<T> | undefined /* only when ready */ }`. A failed load → `offline` (others unaffected); `retry` → `loading` again.
- Produces: `createMockAdapters(): Record<ModelName, ModelAdapter<any>>` — deterministic functions of `tMs`: elliptical person mask swaying sideways; 33-point standing skeleton with swinging arms; two detections ("cup", "cell phone") drifting slowly, the cup crossing the frame center between t = 2 s and t = 8 s; a face box with landmarks whose eyes close for 150 ms every 3 s and whose irises shift left for 1 s every 7 s; horizontal-gradient depth. Mock face also exposes `mockPulseBpm = 72`.

- [ ] **Step 1: Write failing tests:** manager: `ensure loads only requested models`; `a failed load marks only that model offline`; `retry reloads`; `get returns undefined until ready`. mock: `cup is under center between 2 s and 8 s`; `mock outputs are deterministic for the same t`; `mock face blinks every 3 s`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/manager.test.ts tests/unit/mock.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement.** Real adapters are not unit-tested (no model access); they are exercised by the manual checklist (Task 18).
- [ ] **Step 4: Run** → Expected: PASS 7/7.
- [ ] **Step 5: Run** `npm run build` → Expected: succeeds, worker emitted as a separate chunk.
- [ ] **Step 6: Commit** — `feat: model adapters, lazy model manager and mock models`

---

### Task 11: Object tracker

**Files:**
- Create: `src/tools/detective/features/tracker.ts`, `tests/unit/tracker.test.ts`

**Interfaces:**
- Consumes: `Detection` (Task 10).
- Produces: `EVIDENCE_CLASSES: ReadonlySet<string>` (Global Constraints list); `interface Track { id: number; tag: string /* "EV-01" */; label; score; box: [x0,y0,x1,y1]; firstSeenMs; lastSeenMs }`; `class Tracker { constructor(opts?: { iouMatch?: number /* 0.3 */; smoothing?: number /* 0.5 */; dropAfterMs?: number /* 500 */ }); update(dets: Detection[], tMs: number): Track[]; tracks(tMs: number): Track[] }`. Non-evidence labels are ignored. Greedy matching by IoU, same label only; matched box = EMA toward the detection; unmatched detection → new track with next id; tags `EV-` + 2-digit id.

- [ ] **Step 1: Write failing tests:** `ignores person and non-evidence classes`; `keeps the same id for a moving object`; `smooths box jitter`; `two same-class objects keep separate ids`; `drops a track after 500 ms unseen but not before`; `tags are EV-01, EV-02…`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/tracker.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → Expected: PASS 6/6.
- [ ] **Step 5: Commit** — `feat: IoU object tracker for evidence highlighting`

---

### Task 12: Heart rate (rPPG)

**Files:**
- Create: `src/tools/detective/features/rppg.ts`, `tests/unit/rppg.test.ts`

**Interfaces:**
- Consumes: `FaceResult` (Task 10).
- Produces: `faceRois(face: FaceResult): Array<[x0,y0,x1,y1]>` (forehead + both cheeks, normalized, from landmark indices); `sampleRgb(ctx2d, video, rois): [r,g,b] | null` (draws each ROI to a 32×16 scratch canvas and averages); `class HeartRateEstimator { constructor(opts?: { fs?: 30; windowS?: 10; minS?: 6; minConfidence?: 0.35 }); push(tMs: number, rgb: [number, number, number]): void; reset(): void; estimate(): { bpm: number; confidence: number } | null }`.
- Algorithm: keep samples within the last `windowS`; if the gap between consecutive samples > 1 s, `reset()` first (Review Focus 3). Resample linearly to `fs`. POS (Wang et al. 2017): sliding window `l = round(1.6·fs)`; for each window, normalize each channel by its window mean, `S1 = G − B`, `S2 = G + B − 2R`, `h = S1 + (σ(S1)/σ(S2))·S2`, overlap-add `h − mean(h)`. Zero-pad to 1024, Hann window, FFT magnitude², restrict to 0.7–3.0 Hz, peak with parabolic interpolation → BPM. Confidence = power within ±0.1 Hz of the peak ÷ total band power. Return null if span < `minS` or confidence < `minConfidence`. Output BPM smoothed by EMA (α = 0.2) across calls.

- [ ] **Step 1: Write failing tests** (synthetic RGB at irregular ~30 fps timestamps with jitter ±5 ms):
  - `estimates 72 BPM within ±3` — G channel pulse amplitude 0.5% of baseline, R and B 0.2%, Gaussian noise σ = 0.3% of baseline, linear illumination drift of 5% over the window
  - `estimates 110 BPM within ±3` with the same noise
  - `returns null before 6 s`
  - `returns null on pure noise`
  - `a gap longer than 1 s resets the buffer` — 8 s at 72 BPM, 2 s gap, 3 s at 120 BPM → `estimate()` is null (only 3 s since reset)
  - `tolerates 10% dropped frames` → 72 ± 3
- [ ] **Step 2: Run** `npx vitest run tests/unit/rppg.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement** (radix-2 FFT local to the file).
- [ ] **Step 4: Run** → Expected: PASS 6/6.
- [ ] **Step 5: Commit** — `feat: camera heart-rate estimation (POS)`

---

### Task 13: Blink rate and gaze

**Files:**
- Create: `src/tools/detective/features/vitals.ts`, `tests/unit/vitals.test.ts`

**Interfaces:**
- Consumes: `FaceResult` (Task 10).
- Produces: `eyeAspectRatio(face: FaceResult, eye: "left" | "right"): number` (6-point EAR from Face Landmarker indices: left `[33,160,158,133,153,144]`, right `[362,385,387,263,373,380]`); `class BlinkCounter { constructor(opts?: { closeBelow?: 0.19; openAbove?: 0.24; windowS?: 60 }); push(tMs, ear): void; blinksPerMinute(tMs): number | null /* null before 10 s */ }` (hysteresis; a closure lasting > 1 s is not a blink); `gazeDirection(face): "left" | "center" | "right" | "down"` (iris centers 468/473 relative to eye corners; horizontal ratio < 0.4 left, > 0.6 right; vertical ratio > 0.62 down); `class GazeTracker { push(tMs, dir): void; awayPercent(tMs, windowS = 30): number }`.

- [ ] **Step 1: Write failing tests** using a small synthetic `FaceResult` builder that sets just the indices above: `EAR drops when the eye closes`; `counts 10 blinks in 60 s`; `hysteresis ignores flicker around one threshold`; `a 2 s closure is not a blink`; `null before 10 s`; `gaze left/center/right/down from iris position`; `awayPercent is 25 when looking away a quarter of the time`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/vitals.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → Expected: PASS 7/7.
- [ ] **Step 5: Commit** — `feat: blink rate and gaze tracking`

---

### Task 14: 2D overlay drawing

**Files:**
- Create: `src/tools/detective/overlay/overlay.ts`, `tests/unit/overlay.test.ts`

**Interfaces:**
- Consumes: `Viewport`/`toScreen` (Task 7), `Track` (Task 11), `PoseResult` (Task 10), `Overlay`, `HudDensity` (Task 9).
- Produces: `interface OverlayFrame { viewport: Viewport; overlays: Set<Overlay>; hud: HudDensity; pose: PoseResult; tracks: Track[]; scan: { trackId: number | null; progress01: number }; vitals: { bpm: number | null; confidence: number; blinksPerMin: number | null; gaze: string | null; awayPct: number | null }; faceBox: [x0,y0,x1,y1] | null; reticle: boolean }`; `drawOverlay(ctx: CanvasRenderingContext2D, f: OverlayFrame): void`; `hitTestTrack(f: OverlayFrame, x: number, y: number): number | null` (screen px → track id whose drawn box contains the point, smallest box wins).
- Drawing: skeleton (cyan bones from `PoseLandmarker.POSE_CONNECTIONS`, joints with visibility > 0.5); evidence corner brackets in orange + tag + label + score; reticle at screen center; scan progress ring around the targeted box; vitals panel anchored beside the face box (`HR 74 BPM · EST` with a confidence bar, `ELEVATED` when bpm > baseline × 1.15 where baseline is the median of the first 30 s of readings; blinks/min; gaze + away %); hidden values render as `--`. HUD density `minimal` drops labels and scores; `off` draws nothing except the scan ring while scanning.

- [ ] **Step 1: Write failing tests** for `hitTestTrack` (mirrored and unmirrored viewport, overlapping boxes pick the smaller, outside → null).
- [ ] **Step 2: Run** `npx vitest run tests/unit/overlay.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement.** (Visual output is checked by the e2e screenshots in Task 17.)
- [ ] **Step 4: Run** → Expected: PASS.
- [ ] **Step 5: Commit** — `feat: 2D HUD overlay (skeleton, evidence, vitals, reticle)`

---

### Task 15: Scanning and forensic notes

**Files:**
- Create: `src/tools/detective/features/scan.ts`, `src/tools/detective/features/color.ts`, `src/tools/detective/features/localNote.ts`, `src/tools/detective/features/forensics.ts`, `tests/unit/scan.test.ts`, `tests/unit/localNote.test.ts`, `tests/unit/forensics.test.ts`

**Interfaces:**
- Consumes: `Track` (Task 11), `LlmClient`/`LlmError` (Task 5), `EvidenceStore` incl. `putBlob` (Tasks 2–3), `placeNear` (Task 4).
- Produces: `class ScanController { constructor(opts?: { dwellMs?: 2000; cooldownMs?: 10000 }); update(tMs, tracks: Track[], center: {nx;ny}): { targetId: number | null; progress01: number; fire: Track | null }; clickScan(track: Track, tMs): Track | null /* respects nothing — immediate */ }` — target = track whose box contains `center` (smallest if several); progress resets when the target changes or disappears; fires once at 100% then the track enters cooldown.
- Produces: `cropRect(box, srcW, srcH, pad = 0.15, maxSide = 512): { sx; sy; sw; sh; outW; outH }` (clamped to the frame); `centerRegion()` = center 40% box for `S` scans.
- Produces: `dominantColorName(rgba: Uint8ClampedArray): string` (mean of the central 60% of pixels → HSV → one of black, white, gray, red, orange, yellow, green, cyan, blue, purple, pink, brown); `localNote(i: { label; score; color; box; tVisibleS }): string` → e.g. `"CUP — red, small, lower left of frame. In view 14 s. Detector confidence 82%."` (size: small < 5% of frame area, medium < 20%, else large; position from box center on a 3×3 grid, "center" for the middle).
- Produces: `FORENSIC_SYSTEM_PROMPT` (terse forensic examiner; one or two sentences, ≤ 30 words; describe only the object and its visible condition; never identify, describe, or speculate about people); `async function recordScan(deps: { store; llm; caseId; nowMs }, scan: { jpeg: Uint8Array; track: Track | null; color: string; tVisibleS: number; anchor?: {x;y} }): Promise<{ image: Evidence; finding: Evidence; source: "llm" | "local"; reason?: LlmError["kind"] }>` — stores the crop blob + thumbnail, adds `image` evidence (title = tag + label, or "Center scan"), adds `finding` evidence (body = note; `meta.source`, `meta.reason`; title prefixed `LOCAL ANALYSIS — ` when an LLM call failed), links finding → image `derived-from`, both placed with `placeNear`. Note text is truncated to 30 words if the model exceeds it.

- [ ] **Step 1: Write failing tests:**
  - scan: `fires after 2 s of continuous targeting`; `resets when the target changes`; `does not refire on the same track within 10 s`; `click scans immediately even during cooldown`; `cropRect pads 15%, clamps to the frame, and caps the long side at 512`
  - localNote: `names primary colors`; `formats size, position and confidence` (fixed input → exact string above)
  - forensics: `with a working LLM the finding body is the model text and source is llm`; `with no key the finding is local and not prefixed`; `auth error → local note prefixed LOCAL ANALYSIS with reason auth`; `bad-response → local note` (Review Focus 5); `finding is linked derived-from the image`; `long model output is truncated to 30 words`
- [ ] **Step 2: Run** `npx vitest run tests/unit/scan.test.ts tests/unit/localNote.test.ts tests/unit/forensics.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → Expected: PASS 13/13.
- [ ] **Step 5: Commit** — `feat: scanning with LLM and local forensic notes`

---

### Task 16: Capture (snapshot and clip)

**Files:**
- Create: `src/tools/detective/capture.ts`, `tests/unit/capture.test.ts`

**Interfaces:**
- Consumes: store (Tasks 2–3), `placeNear` (Task 4).
- Produces: `compositeFrame(glCanvas, overlayCanvas, out: HTMLCanvasElement): void`; `async snapshot(deps, canvases): Promise<Evidence>` (PNG → `image` evidence, provenance `detective-vision`); `class ClipRecorder { constructor(captureCanvas, opts?: { maxMs?: 30000; mime?: string }); start(): void; stop(): Promise<Blob>; readonly recording: boolean; elapsedMs(): number }` — auto-stops at `maxMs`; `pickClipMime(isSupported: (m: string) => boolean): string` preferring `video/webm;codecs=vp9`, then `vp8`, then `video/webm`.

- [ ] **Step 1: Write failing tests:** `pickClipMime prefers vp9 then vp8 then webm`; `ClipRecorder auto-stops at maxMs` (fake MediaRecorder + fake timers).
- [ ] **Step 2: Run** `npx vitest run tests/unit/capture.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → Expected: PASS 2/2.
- [ ] **Step 5: Commit** — `feat: snapshot and clip capture`

---

### Task 17: Detective Vision tool — engine, HUD controls, integration

**Files:**
- Create: `src/tools/detective/manifest.ts`, `src/tools/detective/engine.ts`, `src/tools/detective/DetectiveView.tsx`, `tests/e2e/detective.spec.ts`
- Create: `src/tools/detective/DetectiveSettings.tsx` (settings section: default preset select, depth on/off with a "WebGPU not available — depth will be slow" note when `!("gpu" in navigator)`)
- Modify: `src/main.tsx` (register the manifest)

**Interfaces:**
- Consumes: everything above.
- Produces: manifest `{ id: "detective-vision", name: "Detective Vision", accepts: ["live-camera", "video"] }`; `class DetectiveEngine { constructor(deps: { source: FrameSource; glCanvas; overlayCanvas; manager: ModelManager; scheduler: ModelScheduler; store; llm; caseId; settings }); setPreset(p: PresetDef); setMode(m); toggleOverlay(o); setPalette(p); setHud(h); scanCenter(); click(x, y); snapshot(); startClip(); stopClip(); onState(fn: (s: EngineState) => void); start(); dispose() }`; `EngineState { fps; modelStatus: Record<ModelName, status>; schedulerStats; recording; lastFinding?: Evidence; signal: "ok" | "lost"; perfHint?: string }`.
- Engine loop (rAF): on new frame → `scheduler.onNewFrame`; tasks feed renderer (mask, depth, boxes, face) and features (tracker, rPPG via `sampleRgb`, blink, gaze); scan controller → `recordScan` (crop from the source video, not the stylized canvas); `manager.ensure(requiredModels(...))` and `scheduler.setActive` whenever mode/overlays change; mode change starts a 0.9 s transition; `reportFrameTime` each frame; `perfHint` names the heaviest active task when fps < 27 for 5 s with every optional task already at `maxInterval`. Signal lost → keep the last frame, show `SIGNAL LOST`.
- DetectiveView HUD: mode switcher, overlay toggles, palette (thermal only), HUD density, preset buttons + number keys 1–9, "save preset", snapshot / record buttons, scan hint (`S`), perf panel (per-task interval and ms, model status chips with retry for `offline`), case-file panel with typewriter reveal of the latest finding, video controls (play/pause/scrub) when the source is a file. `?mock` → `createMockAdapters()`.
- Camera errors: `denied`/`not-found` → message + "Open a video from this case" list of the case's video evidence.

- [ ] **Step 1: Write e2e** `tests/e2e/detective.spec.ts` (fake camera + `?mock`), covering spec §1.4:
  - create case → "Open tool → Detective Vision (live camera)" → canvas renders, model chips reach `READY` (mock)
  - cycle all five modes and toggle all six overlays and three HUD densities without page errors; screenshot each mode with the Investigate overlays to `test-results/dv-<mode>.png`
  - wait for the mock cup to cross center → within 4 s a scan completes; return to board → an `image` and a `finding` (`meta.source = "local"`, no key) exist, linked
  - snapshot button → new `image` evidence; record 2 s clip → new `video` evidence
  - open that `video` evidence via "Send to → Detective Vision" → renders, scrub backwards → no page errors (Review Focus 2)
  - reload → all evidence persists
- [ ] **Step 2: Run** `npm run test:e2e -- detective` → Expected: FAIL (tool not registered).
- [ ] **Step 3: Implement** manifest, engine, view.
- [ ] **Step 4: Run** → Expected: PASS. Read every `dv-*.png` and check overlays line up with the mock objects; ledger one line per mode.
- [ ] **Step 5: Run full suites** `npm test && npm run test:e2e` → Expected: all pass.
- [ ] **Step 6: Commit** — `feat: Detective Vision tool integrated with the case board`

---

### Task 18: README, manual checklist, deploy

**Files:**
- Modify: `README.md` (Belfry overview, the seven-part roadmap table from spec §1.3, how to run/test/deploy, `?mock`, privacy note: video never leaves the browser except scan crops sent to Claude when a key is set, heart rate is an estimate and not medical), `vite.config.ts` if needed
- Create: `docs/manual-checklist.md` (spec §7.3, as checkboxes: each model reaches ready; HR within ~5 BPM of a 30 s manual pulse count in good light; deliberate blinks counted; scan with a key yields an LLM note; ~30 fps with Investigate; camera unplug → SIGNAL LOST → recovers), `.github/workflows/pages.yml` (build on push to `main`, deploy `dist` to Pages; `npm ci` runs `postinstall`)

- [ ] **Step 1: Write the files.**
- [ ] **Step 2: Run** `npm run build && npm test` → Expected: both succeed.
- [ ] **Step 3: Commit** — `docs: README, manual test checklist and Pages deploy`
