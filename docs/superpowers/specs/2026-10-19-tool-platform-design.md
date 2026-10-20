# Belfry — Tool Platform (next-steps §2) Design

Written 2026-10-19. Covers the platform work in `docs/next-steps.md` §2 that every later tool needs, plus one board decision from the critique's open questions. No new tool ships here; Detective Vision is moved onto the new interfaces so they have a real consumer.

## 1. Decisions

| Question | Decision |
|---|---|
| How does a tool get an image or audio file? | `ToolInput` stays `live-camera` / demo / evidence. A new route input `pick` opens a tool with no input yet; the host shows the shared **No Signal** screen, which lists the case's evidence the tool accepts, opens a file from the device, or runs the tool's demo. Detective Vision's camera-error screen becomes the same component. |
| Demo inputs | `demo` is a **required** manifest field (`{ label }`), so a tool can't register without one. The input kind is `demo` (route `demo`; the old `demo-feed` route still parses). |
| Which tools does the board rack show? | Every registered tool, not only camera tools. A tool that takes the camera opens on it; any other opens on `pick`. |
| Does `finding` gain subtypes? | No new evidence type. A finding may carry `meta.finding`, a typed detail: `measurement` (value, unit, ± uncertainty), `location` (lat, lon, ± radius) or `decode` (scheme, text). Without it, a finding is a plain observation. Readers validate it and ignore malformed detail, so imported files can't break a card. |
| Heavy maths | A shared `WorkerPool` runs named ops in module workers: lazy spawn, at most `min(4, cores − 1)` workers, FIFO queue, transferables, abort (terminates and replaces the worker), crash recovery. First op: FFT, moved out of `rppg.ts` into `platform/math/fft.ts`. |
| LLM client | `message()` (any content, optional tools), `text()`, `stream()` (SSE, idle timeout, text deltas through a callback), and `toolLoop()` (runs handlers for `tool_use`, feeds back `tool_result`, stops at `maxTurns`). `describeImage` is a thin wrapper. Callers still own the non-LLM fallback. Cancellation is a new `aborted` error kind. |
| Board as map, index as reading surface (critique open question) | **Index rows expand.** The selected exhibit's index row opens in place to the full exhibit: preview, full text (cards clamp it to five lines), finding detail, tags, time, provenance and every card action. Selecting on the wall opens the row too, and scrolls it into view. Roadmap tools stay where they are. |

## 2. Tool inputs

- `src/tools/inputs.ts`:
  - `parseToolInput(store, raw)`: `live-camera`, `demo`/`demo-feed`, `pick`, or `ev:<id>`. Unknown strings and missing evidence come back as errors.
  - `defaultInput(manifest)`.
  - `fileAcceptFor(accepts)` → `"image/*,video/*"`.
  - `pickableEvidence(evidence, accepts)`.
  - `readEvidenceBlob(store, ev)`, which throws a plain-words error when the file is missing.
- `src/tools/NoSignal.tsx` is a bezelled screen (The Monitor Rule) that takes a `message`, the manifest and the context. Picking a file pins it to the case first and then opens the tool on it, so whatever the tool makes is derived from evidence on the board. A file of a type the tool doesn't take is refused with the reason.
- `ToolContext` gains `openInput(raw)`, so tools stop building routes themselves.

## 3. Finding detail

`schema.ts` gains a `FindingDetail` union and `readFindingDetail(meta)`. `formatFindingDetail(d)` gives the readout line:

- `12.3 ± 0.4 px`
- `51.50120° N, 0.12460° W ± 50 m`
- `DTMF · 5550134`

Unknown values show `--`, never `NaN`. Cards and expanded index rows show it in the amber readout style, and the type label says `Finding · Measurement`.

## 4. Worker pool

- `src/platform/workers/pool.ts` is framework-free and takes a `WorkerLike` factory, so it is unit-tested without real workers.
- Messages are `{ id, op, payload }` → `{ id, ok: true, result } | { id, ok: false, error }`.
- `src/platform/workers/ops.ts` is the op table, shared by the worker and the tests. `compute.worker.ts` dispatches into it, and `compute.ts` holds the app-wide pool and typed helpers (`compute.fft`).

## 5. LLM client

- Same endpoint, headers and error mapping as today.
- `stream()` sends `stream: true` and parses `content_block_start`, `content_block_delta` (`text_delta`, `input_json_delta`), `message_delta` (stop reason) and `error` events.
- The timeout is an idle timeout: it is reset on each chunk.
- `toolLoop()` never runs a tool that has no handler. Unknown tools and handler errors go back to the model as `is_error` tool results.

## 6. Testing

- **Unit:** inputs, finding detail, FFT (delta, sine peak, inverse round trip, Parseval, bad length), pool (queueing, size cap, transfer, abort, crash, dispose), and LLM (message, stream parsing incl. tool input JSON, mid-stream error, idle timeout, abort, tool loop).
- **E2E:** the index row expands to the full text and actions when a card is selected, and Detective Vision's No Signal screen still offers the case's footage and the demo.
- **Pattern for later tools:** a mock mode plus a deterministic demo input, unit tests for the maths, and one Playwright flow that ends with evidence on the board.

## 7. Out of scope

- Any new tool.
- Audio `FrameSource`.
- HEIC.
- Depth fp16 fallback and the unused ORT wasm (tracked in next-steps §1).
