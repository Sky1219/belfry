import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { runOp } from "../../platform/workers/compute";
import type { HeatMap } from "../../platform/workers/ops";
import type { Evidence } from "../../store/schema";
import { HudButton, type LampState } from "../../ui/components";
import { decodeImage, encodeImage } from "../imagekit/decode";
import { MAP_SIDE } from "../imagekit/heatmap";
import { ImageToolShell, ToolPanel } from "../imagekit/ImageToolShell";
import { pinResult, type PinDeps, type PinRequest } from "../imagekit/pin";
import { downscale, toGray, undoOrientation, type Pixels } from "../imagekit/pixels";
import { usePinQueue } from "../imagekit/usePinQueue";
import { useRun, type Run } from "../imagekit/useRun";
import { useToolImage } from "../imagekit/useToolImage";
import type { ToolContext } from "../types";
import { copyMoveFinding, markRegions, type CopyMoveResult } from "./copyMove";
import { makeForensicsDemo } from "./demo";
import { ELA_GAIN, ELA_QUALITY, elaFinding } from "./ela";
import { jpegFinding, readJpeg } from "./jpeg";
import { photoManifest } from "./manifest";
import { metadataFinding, readMetadata } from "./metadata";
import { noiseFinding } from "./noise";
import "./photo.css";

/** Copy-move compares blocks at this long side at most (spec §1). */
const COPY_MOVE_SIDE = 512;
/** Above this many pixels the analyses run one at a time (Ruling R15). */
const ONE_AT_A_TIME_PIXELS = 16_000_000;
const AMBER = [255, 167, 51] as const; // #ffa733, mirrored from the theme for the overlay
const NOT_JPEG = "Not a JPEG: quantization tests don't apply.";

type Finding = PinRequest["finding"];

/**
 * Starts each analysis at once, or, with `oneAtATime`, each after the one
 * before has settled, so a big photo's full-size copies (its gray, the re-save,
 * the worker's buffers) are never all alive together. A run aborted while it
 * waits never starts.
 */
function analysisQueue(oneAtATime: boolean) {
  let tail: Promise<unknown> = Promise.resolve();
  return <T,>(signal: AbortSignal, run: () => Promise<T>): Promise<T> => {
    if (!oneAtATime) return run();
    const next = tail.then(() => {
      if (signal.aborted) throw new Error("Cancelled");
      return run();
    });
    tail = next.catch(() => undefined);
    return next;
  };
}

const isConsistent = (title: string) => title.includes(": consistent with ");
const lampFor = (run: Run<unknown>, consistent = false): LampState =>
  run.state === "working" ? "pulse" : run.state === "failed" || consistent ? "amber" : "off";

/** A finding as the panel shows it: the title the board card will carry, then its body. */
function FindingText(props: { finding: Finding }) {
  const { title, body } = props.finding;
  return (
    <div className="pf-finding">
      <p className={`pf-verdict ${isConsistent(title) ? "lit" : ""}`}>{title}</p>
      <p className="pf-body">{body}</p>
    </div>
  );
}

function Working() {
  return <p className="label pf-working">Working</p>;
}

function Failed(props: { message: string }) {
  return (
    <p className="pf-problem" role="alert">
      Couldn&rsquo;t run this test: {props.message}
    </p>
  );
}

/** A coloured map on the panel's glass, at its own pixel size; CSS fits it to the column. */
function MapCanvas(props: { map: HeatMap; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { map } = props;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = map.width;
    c.height = map.height;
    c.getContext("2d")!.putImageData(new ImageData(map.rgba as Uint8ClampedArray<ArrayBuffer>, map.width, map.height), 0, 0);
  }, [map]);
  return <canvas ref={ref} className="pf-map" role="img" aria-label={props.label} />;
}

/** The map as a PNG exhibit, for pinning beside its finding. */
async function mapImage(map: HeatMap, title: string, meta: Record<string, unknown>) {
  const bytes = await encodeImage({ width: map.width, height: map.height, data: map.rgba }, "image/png");
  return { bytes, mime: "image/png", title, meta: { ...meta, width: map.width, height: map.height } };
}

/** The copy-move mask as an amber wash at mask resolution; the shell scales it up over the photo. */
function maskOverlay(r: CopyMoveResult): OffscreenCanvas | null {
  if (!r.shift || !r.mask.includes(1)) return null;
  const data = new Uint8ClampedArray(r.width * r.height * 4);
  for (let i = 0; i < r.mask.length; i++) {
    if (r.mask[i]) data.set([AMBER[0], AMBER[1], AMBER[2], 115], i * 4);
  }
  const canvas = new OffscreenCanvas(r.width, r.height);
  canvas.getContext("2d")!.putImageData(new ImageData(data, r.width, r.height), 0, 0);
  return canvas;
}

/** Each panel's pin count, and a pin function that bumps it once the pin lands. */
function usePins(deps: PinDeps) {
  const [pinned, setPinned] = useState<Record<string, number>>({});
  // every pin across the panels waits for the one before, so each is placed clear of it
  const queue = usePinQueue();
  const pin = (panel: string, ...requests: PinRequest[]) => async () => {
    await queue(async () => {
      for (const req of requests) await pinResult(deps, req);
    });
    setPinned((p) => ({ ...p, [panel]: (p[panel] ?? 0) + 1 }));
  };
  return { pinned, pin };
}

function Panels(props: { ctx: ToolContext; source: Evidence; bytes: Uint8Array; pixels: Pixels; onOverlay(o: OffscreenCanvas | null): void }) {
  const { ctx, source, bytes, pixels, onOverlay } = props;
  const { pinned, pin } = usePins({ store: ctx.store, caseId: ctx.caseId, toolId: ctx.toolId });

  const meta = useMemo(() => readMetadata(bytes), [bytes]);
  const metadata = useMemo(() => metadataFinding(meta), [meta]);
  const jpegInfo = useMemo(() => readJpeg(bytes), [bytes]);
  const { width, height } = pixels;
  const inTurn = useMemo(() => analysisQueue(pixels.width * pixels.height > ONE_AT_A_TIME_PIXELS), [pixels]);

  // copy-move first: it is the quickest, and its panel leads the column
  const copyMove = useRun(pixels, (signal) =>
    inTurn(signal, async () => {
      const small = downscale(pixels, COPY_MOVE_SIDE);
      const g = toGray(small);
      return runOp("copyMove", { gray: g, width: small.width, height: small.height }, { signal, transfer: [g.buffer] });
    }),
  );

  const jpeg = useRun(pixels, (signal) =>
    inTurn(signal, async () => {
      if (!jpegInfo) return null;
      if (!jpegInfo.tables.get(0)) return jpegFinding(jpegInfo, null);
      const luma = jpegInfo.tables.get(0)!;
      // the DQ score reads the file's own 8x8 grid, so the display orientation is undone first;
      // the reader keeps only orientations 1-8, and anything else can't be lined up (inconclusive)
      const orientation = meta.orientation ?? 1;
      if (!(orientation >= 1 && orientation <= 8)) {
        return jpegFinding(jpegInfo, null, "The photo's orientation tag isn't one of 1 to 8, so its stored 8×8 grid can't be lined up to score.");
      }
      // the full-size gray is made here and handed to the worker, so no copy of it outlives the run (Ruling R15)
      const gray = toGray(pixels);
      const stored = orientation === 1 ? { gray, width, height } : undoOrientation(gray, width, height, orientation);
      const dq = await runOp("dq", { gray: stored.gray, width: stored.width, height: stored.height, luma }, { signal, transfer: [stored.gray.buffer] });
      return jpegFinding(jpegInfo, dq);
    }),
  );

  const ela = useRun(pixels, (signal) =>
    inTurn(signal, async () => {
      const blob = new Blob([(await encodeImage(pixels, "image/jpeg", ELA_QUALITY)) as BlobPart], { type: "image/jpeg" });
      const resaved = await decodeImage(blob);
      const original = pixels.data.slice();
      return runOp("ela", { original, resaved: resaved.data, width, height }, { signal, transfer: [original.buffer, resaved.data.buffer] });
    }),
  );

  const noise = useRun(pixels, (signal) =>
    inTurn(signal, async () => {
      const g = toGray(pixels);
      return runOp("noise", { gray: g, width, height }, { signal, transfer: [g.buffer] });
    }),
  );

  const cm = copyMove.state === "done" ? copyMove.value : null;
  const cmText = cm ? copyMoveFinding(cm) : null;
  // amber marks a finding: only a consistent verdict marks the photo, matching the lamp (Ruling R16)
  const cmConsistent = cmText?.verdict === "consistent";
  const cmMarked = !!cm?.shift && cmConsistent;
  useEffect(() => onOverlay(cm && cmMarked ? maskOverlay(cm) : null), [cm, cmMarked, onOverlay]);

  let jpegBody: ReactNode;
  let jpegPin: (() => Promise<void>) | undefined;
  let jpegLamp = lampFor(jpeg);
  let quality = "--";
  if (jpeg.state === "working") jpegBody = <Working />;
  else if (jpeg.state === "failed") jpegBody = <Failed message={jpeg.message} />;
  else if (!jpeg.value) jpegBody = <p className="pf-verdict">{NOT_JPEG}</p>;
  else {
    const f = jpeg.value;
    jpegBody = (
      <>
        <FindingText finding={f.quality} />
        <FindingText finding={f.dq} />
      </>
    );
    jpegPin = pin("jpeg", { source, finding: f.quality }, { source, finding: f.dq });
    jpegLamp = lampFor(jpeg, isConsistent(f.dq.title));
    if (f.quality.detail.kind === "measurement" && f.quality.detail.value !== null) quality = `Q ${f.quality.detail.value}`;
  }

  const elaText = elaFinding();
  const noiseText = noise.state === "done" ? noiseFinding(noise.value.inconsistency) : null;

  // verdicts first (copy-move explains the marks on the photo), then the file's facts, then the two maps
  return (
    <>
      <ToolPanel
        id="copy-move"
        title="Copy-move"
        lamp={lampFor(copyMove, cmConsistent)}
        readout={cm && <span className="num">{`${cm.blocks} ${cm.blocks === 1 ? "block" : "blocks"}`}</span>}
        onPin={
          cm && cmText
            ? async () => {
                // the regions are marked on the photo at map size, so the board shows where they are;
                // with no consistent verdict there is nothing to assert, so only the finding is pinned (Ruling R16)
                const marked = cmMarked ? markRegions(downscale(pixels, MAP_SIDE), cm.mask, cm.width, cm.height) : null;
                const image = marked && {
                  bytes: await encodeImage(marked, "image/png"),
                  mime: "image/png",
                  title: "Copy-move regions",
                  meta: { map: "copy-move", shift: cm.shift, blocks: cm.blocks, width: marked.width, height: marked.height },
                };
                await pin("copy-move", { source, image: image ?? undefined, finding: cmText })();
              }
            : undefined
        }
        pinned={pinned["copy-move"]}
      >
        {copyMove.state === "working" && <Working />}
        {copyMove.state === "failed" && <Failed message={copyMove.message} />}
        {cmText && (
          <>
            <FindingText finding={cmText} />
            {cmMarked && <p className="label pf-key">Matched blocks are washed amber on the photo</p>}
          </>
        )}
      </ToolPanel>

      <ToolPanel id="jpeg" title="JPEG" lamp={jpegLamp} readout={<span className="num">{quality}</span>} onPin={jpegPin} pinned={pinned.jpeg}>
        {jpegBody}
      </ToolPanel>

      <ToolPanel id="metadata" title="Metadata" lamp="off" onPin={pin("metadata", { source, finding: metadata })} pinned={pinned.metadata}>
        <FindingText finding={metadata} />
      </ToolPanel>

      <ToolPanel
        id="ela"
        title="Error levels"
        lamp={lampFor(ela)}
        readout={<span className="num">{`Q ${Math.round(ELA_QUALITY * 100)} ×${ELA_GAIN}`}</span>}
        onPin={
          ela.state === "done"
            ? async () => {
                const image = await mapImage(ela.value, "Error level map", { map: "ela", quality: ELA_QUALITY, gain: ELA_GAIN });
                await pin("ela", { source, image, finding: elaText })();
              }
            : undefined
        }
        pinned={pinned.ela}
      >
        {ela.state === "working" && <Working />}
        {ela.state === "failed" && <Failed message={ela.message} />}
        {ela.state === "done" && (
          <>
            <MapCanvas map={ela.value} label="Error level map of the photo" />
            <FindingText finding={elaText} />
          </>
        )}
      </ToolPanel>

      <ToolPanel
        id="noise"
        title="Noise residual"
        lamp={lampFor(noise)}
        readout={<span className="num">{noiseText?.detail.kind === "measurement" && noiseText.detail.value !== null ? `spread ${noiseText.detail.value.toFixed(2)}` : "spread --"}</span>}
        onPin={
          noise.state === "done" && noiseText
            ? async () => {
                const image = await mapImage(noise.value, "Noise residual map", { map: "noise" });
                await pin("noise", { source, image, finding: noiseText })();
              }
            : undefined
        }
        pinned={pinned.noise}
      >
        {noise.state === "working" && <Working />}
        {noise.state === "failed" && <Failed message={noise.message} />}
        {noise.state === "done" && noiseText && (
          <>
            <MapCanvas map={noise.value} label="Noise residual map of the photo" />
            <FindingText finding={noiseText} />
          </>
        )}
      </ToolPanel>
    </>
  );
}

/**
 * Photo forensics: five tests on one photo, each on its own screen beside the
 * photo, each pinning its result to the board linked back to the photo.
 */
export function PhotoForensicsView({ ctx }: { ctx: ToolContext }) {
  const image = useToolImage(ctx, makeForensicsDemo);
  const [overlay, setOverlay] = useState<OffscreenCanvas | null>(null);
  const ready = image.phase === "ready" ? image : null;
  const pixels = ready?.pixels;

  const drawOverlay = useCallback(
    (g: CanvasRenderingContext2D) => {
      if (!overlay || !pixels) return;
      g.imageSmoothingEnabled = false;
      g.drawImage(overlay, 0, 0, pixels.width, pixels.height);
    },
    [overlay, pixels],
  );

  return (
    <ImageToolShell tool={photoManifest} ctx={ctx} source={ready?.source} pixels={pixels} drawOverlay={overlay ? drawOverlay : undefined}>
      {ready && <Panels ctx={ctx} source={ready.source} bytes={ready.bytes} pixels={ready.pixels} onOverlay={setOverlay} />}
      {image.phase === "error" && (
        <ToolPanel id="photo" title="No photo" lamp="amber">
          <p className="pf-problem" role="alert">
            {image.message}
          </p>
          <div>
            <HudButton small onClick={() => ctx.openInput("pick")}>
              Choose another photo
            </HudButton>
          </div>
        </ToolPanel>
      )}
    </ImageToolShell>
  );
}
