import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getToolSettings, setToolSettings } from "../../app/settings";
import { useBlobUrl } from "../../app/storeContext";
import { exhibitTag } from "../../board/EvidenceCard";
import { runOp } from "../../platform/workers/compute";
import type { Evidence } from "../../store/schema";
import { Bezel, HudButton, type LampState } from "../../ui/components";
import { readEvidenceBlob } from "../inputs";
import { decodeImage } from "../imagekit/decode";
import { ExhibitPicker } from "../imagekit/ExhibitPicker";
import { ImageToolShell, ToolPanel } from "../imagekit/ImageToolShell";
import { pinDemoInput, pinResult, type PinDeps, type PinImage } from "../imagekit/pin";
import { downscale, toGray, type Pixels } from "../imagekit/pixels";
import { useToolImage } from "../imagekit/useToolImage";
import type { ToolContext } from "../types";
import { makeFingerprintDemo } from "./demo";
import { fingerprintManifest } from "./manifest";
import { fingerprintFinding, matchMinutiae, type MinutiaeMatch } from "./match";
import type { PrintAnalysis } from "./pipeline";
import "./fingerprint.css";

const NOTICE = "Compare your own prints only. Prints are processed on this device and never leave it. This is not an identification.";
const ACK = "I'm comparing my own prints";
const NOTICE_DEFAULTS = { fingerprintNoticeSeen: false };
/** Each print is analysed at this long side at most (spec §1). */
const ANALYSIS_SIDE = 640;
// mirrored from the theme for the canvas drawing
const AMBER = "#ffa733";
const BONE = "#ece6dc";
const BONE_RGB = [236, 230, 220] as const;
const GLASS = "#07090c";
/** Space between the two prints in the comparison image, px. */
const GUTTER = 16;

type Run<T> = { state: "working" } | { state: "done"; value: T } | { state: "failed"; message: string };

/**
 * Runs one job off the render path whenever `key` changes. A newer key or
 * unmounting aborts the old run, and its result is dropped.
 */
function useRun<T>(key: unknown, run: (signal: AbortSignal) => Promise<T>): Run<T> {
  const [result, setResult] = useState<Run<T>>({ state: "working" });
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    const ctl = new AbortController();
    setResult({ state: "working" });
    latest.current(ctl.signal).then(
      (value) => !ctl.signal.aborted && setResult({ state: "done", value }),
      (e: Error) => !ctl.signal.aborted && setResult({ state: "failed", message: e.message }),
    );
    return () => ctl.abort();
  }, [key]);
  return result;
}

/** A print as the lab analysed it: the pipeline's result and the gray it ran on, for drawing. */
interface Print {
  analysis: PrintAnalysis;
  gray: Float32Array;
}

/** Scales a print to the analysis size and runs the pipeline on the worker pool. */
async function analyse(pixels: Pixels, signal: AbortSignal): Promise<Print> {
  const small = downscale(pixels, ANALYSIS_SIDE);
  const gray = toGray(small);
  const sent = gray.slice();
  const analysis = await runOp("fingerprint", { gray: sent, width: small.width, height: small.height }, { signal, transfer: [sent.buffer] });
  return { analysis, gray };
}

/** Pins the demo's print B, then hands back print A naming it, so the lab opens on the pair. */
async function demoPair(deps: PinDeps): Promise<PinImage> {
  const { a, b } = await makeFingerprintDemo();
  const pinnedB = await pinDemoInput(deps, b);
  return { ...a, meta: { pairWith: pinnedB.id } };
}

/**
 * Both prints side by side on black glass: each one dimmed, its ridge skeleton
 * in dim bone over it, every minutia a small square, and each matched pair joined
 * by an amber line (matched minutiae are amber too).
 */
function drawComparison(a: Print, b: Print, m: MinutiaeMatch): OffscreenCanvas {
  const A = a.analysis;
  const B = b.analysis;
  const width = A.width + GUTTER + B.width;
  const height = Math.max(A.height, B.height);
  const canvas = new OffscreenCanvas(width, height);
  const g = canvas.getContext("2d")!;
  g.fillStyle = GLASS;
  g.fillRect(0, 0, width, height);

  const offsets = [0, A.width + GUTTER];
  [a, b].forEach((p, k) => {
    const { width: w, height: h, skeleton } = p.analysis;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      // ridges at a little over half strength, so the amber pairs read over them at column width
      if (skeleton[i]) data.set([BONE_RGB[0] * 0.55, BONE_RGB[1] * 0.55, BONE_RGB[2] * 0.55, 255], i * 4);
      else {
        const v = p.gray[i] * 0.2;
        data.set([v, v, v, 255], i * 4);
      }
    }
    g.putImageData(new ImageData(data, w, h), offsets[k], 0);
  });

  const matchedA = new Set(m.pairs.map(([i]) => i));
  const matchedB = new Set(m.pairs.map(([, j]) => j));
  // 2 px strokes: the panel shows the comparison at about a quarter of its size on a desktop column
  g.lineWidth = 2;
  g.strokeStyle = AMBER;
  g.beginPath();
  for (const [i, j] of m.pairs) {
    g.moveTo(A.minutiae[i].x, A.minutiae[i].y);
    g.lineTo(offsets[1] + B.minutiae[j].x, B.minutiae[j].y);
  }
  g.stroke();
  const square = (x: number, y: number, lit: boolean) => {
    g.strokeStyle = lit ? AMBER : BONE;
    g.strokeRect(Math.round(x) - 4, Math.round(y) - 4, 8, 8);
  };
  A.minutiae.forEach((q, i) => square(q.x, q.y, matchedA.has(i)));
  B.minutiae.forEach((q, j) => square(offsets[1] + q.x, q.y, matchedB.has(j)));
  return canvas;
}

/** The comparison on the panel's glass, at its own pixel size; CSS fits it to the column. */
function ComparisonCanvas(props: { image: OffscreenCanvas }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { image } = props;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = image.width;
    c.height = image.height;
    c.getContext("2d")!.drawImage(image, 0, 0);
  }, [image]);
  return <canvas ref={ref} className="fp-compare" role="img" aria-label="Print A and print B side by side, matched minutiae joined in amber" />;
}

/** Print A's minutiae, in the photo's own coordinates, for the Source screen. */
interface Marks {
  /** The width print A was analysed at; the points are in its pixels. */
  width: number;
  points: Array<{ x: number; y: number; matched: boolean }>;
  /** Matched minutiae are amber only on a "consistent with" verdict (amber marks a finding). */
  lit: boolean;
}

const isConsistent = (title: string) => title.includes(": consistent with ");

function Working() {
  return <p className="label fp-working">Working</p>;
}

function Failed(props: { message: string }) {
  return (
    <p className="fp-problem" role="alert">
      Couldn&rsquo;t compare the prints: {props.message}
    </p>
  );
}

/** The privacy notice; until it is acknowledged no print is analysed (Ruling P2-R1). */
function Notice(props: { onAck(): void }) {
  return (
    <div className="ik-panel" data-testid="fp-notice">
      <Bezel title="Before you compare" titleId="fp-notice-title" lamp="amber">
        <div className="panel-body col fp-notice">
          <p className="fp-notice-text">{NOTICE}</p>
          <div>
            <HudButton active data-testid="fp-notice-ack" onClick={props.onAck}>
              {ACK}
            </HudButton>
          </div>
        </div>
      </Bezel>
    </div>
  );
}

/** The second print: which exhibit it is, or the picker to choose one (never print A itself). */
function PrintB(props: {
  ctx: ToolContext;
  source: Evidence;
  print: Evidence | null | "looking";
  picking: boolean;
  onPicking(on: boolean): void;
  onPick(e: Evidence): void;
}) {
  const { ctx, source, print, picking } = props;
  const chosen = print && print !== "looking" ? print : null;
  const thumb = useBlobUrl(chosen ? (chosen.thumbHash ?? chosen.blobHash) : undefined);
  const [exhibit, setExhibit] = useState<number | undefined>();
  useEffect(() => {
    if (!chosen) return setExhibit(undefined);
    let alive = true;
    ctx.store.exhibitNumbers(ctx.caseId).then((m) => alive && setExhibit(m.get(chosen.id)));
    return () => {
      alive = false;
    };
  }, [ctx.store, ctx.caseId, chosen]);

  return (
    <ToolPanel id="print-b" title="Print B" lamp="off" readout={chosen && <span className="num">{exhibitTag(exhibit)}</span>}>
      {print === "looking" && <Working />}
      {chosen && !picking && (
        <div className="fp-print-b">
          {thumb ? <img src={thumb} alt="" draggable={false} /> : <span className="fp-print-blank" aria-hidden />}
          <span className="fp-print-title">{chosen.title}</span>
          <HudButton small data-testid="fp-change-b" onClick={() => props.onPicking(true)}>
            Compare another print
          </HudButton>
        </div>
      )}
      {(print === null || picking) && (
        <>
          <p className="fp-body">Choose the print to compare with this one.</p>
          <ExhibitPicker caseId={ctx.caseId} store={ctx.store} excludeId={source.id} onPick={props.onPick} />
          {chosen && (
            <div>
              <HudButton small onClick={() => props.onPicking(false)}>
                Keep {chosen.title}
              </HudButton>
            </div>
          )}
        </>
      )}
    </ToolPanel>
  );
}

/** Print B's analysis, the match, and its finding, comparison and pin. Keyed by print B. */
function Match(props: { ctx: ToolContext; source: Evidence; printB: Evidence; a: Run<Print>; onMarks(m: Marks | null): void }) {
  const { ctx, source, printB, a, onMarks } = props;
  const b = useRun(printB.id, async (signal) => {
    const pixels = await decodeImage(await readEvidenceBlob(ctx.store, printB));
    return analyse(pixels, signal);
  });

  const pa = a.state === "done" ? a.value : null;
  const pb = b.state === "done" ? b.value : null;
  const result = useMemo(() => {
    if (!pa || !pb) return null;
    const m = matchMinutiae(pa.analysis.minutiae, pb.analysis.minutiae);
    return { m, finding: fingerprintFinding(pa.analysis.minutiae, pb.analysis.minutiae, m), image: drawComparison(pa, pb, m) };
  }, [pa, pb]);

  const consistent = !!result && isConsistent(result.finding.title);
  useEffect(() => {
    if (!result || !pa) return onMarks(null);
    const matched = new Set(result.m.pairs.map(([i]) => i));
    onMarks({ width: pa.analysis.width, points: pa.analysis.minutiae.map((q, i) => ({ x: q.x, y: q.y, matched: matched.has(i) })), lit: consistent });
  }, [result, pa, consistent, onMarks]);
  useEffect(() => () => onMarks(null), [onMarks]);

  // pins wait for the one before, so each is placed clear of it
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [pinned, setPinned] = useState(0);
  const pin = async () => {
    if (!result) return;
    const { finding, image, m } = result;
    const prints = [source.id, printB.id];
    const run = queue.current.catch(() => undefined).then(async () => {
      const blob = await image.convertToBlob({ type: "image/png" });
      const pinnedResult = await pinResult(
        { store: ctx.store, caseId: ctx.caseId, toolId: ctx.toolId },
        {
          source,
          image: {
            bytes: new Uint8Array(await blob.arrayBuffer()),
            mime: "image/png",
            title: "Fingerprint comparison",
            meta: { map: "fingerprint", prints, matched: m.matched, width: image.width, height: image.height },
          },
          finding: { ...finding, meta: { prints } },
        },
      );
      // the finding rests on both prints: print A through the comparison, print B directly
      await ctx.store.addLink({ caseId: ctx.caseId, fromId: pinnedResult.finding.id, toId: printB.id, kind: "derived-from" });
    });
    queue.current = run;
    await run;
    setPinned((n) => n + 1);
  };

  const failed = a.state === "failed" ? a : b.state === "failed" ? b : null;
  const lamp: LampState = failed || consistent ? "amber" : result ? "off" : "pulse";
  const score = result?.finding.detail?.kind === "measurement" ? result.finding.detail.value : null;

  return (
    <ToolPanel
      id="match"
      title="Match"
      lamp={lamp}
      readout={<span className="num">{score !== null ? `score ${score.toFixed(2)}` : "score --"}</span>}
      onPin={result ? pin : undefined}
      pinned={pinned}
    >
      {failed && <Failed message={failed.message} />}
      {!failed && !result && <Working />}
      {result && (
        <>
          <ComparisonCanvas image={result.image} />
          <p className="label fp-key">
            {`${result.m.matched} matched ${result.m.matched === 1 ? "pair" : "pairs"} joined in amber`}
          </p>
          <div className="fp-finding">
            <p className={`fp-verdict ${consistent ? "lit" : ""}`}>{result.finding.title}</p>
            <p className="fp-body">{result.finding.body}</p>
          </div>
        </>
      )}
    </ToolPanel>
  );
}

/** Everything after the notice: print A's analysis, choosing print B, and the match. */
function Lab(props: { ctx: ToolContext; source: Evidence; pixels: Pixels; onMarks(m: Marks | null): void }) {
  const { ctx, source, pixels, onMarks } = props;
  const pairWith = typeof source.meta?.pairWith === "string" ? source.meta.pairWith : null;
  const [printB, setPrintB] = useState<Evidence | null | "looking">(pairWith ? "looking" : null);
  const [picking, setPicking] = useState(false);

  // the demo's print A names its partner, so the pair opens without asking
  useEffect(() => {
    setPicking(false);
    if (!pairWith) return setPrintB(null);
    setPrintB("looking");
    let alive = true;
    ctx.store.getEvidence(pairWith).then(
      (e) => alive && setPrintB(e && e.type === "image" && e.id !== source.id ? e : null),
      () => alive && setPrintB(null),
    );
    return () => {
      alive = false;
    };
  }, [ctx.store, source.id, pairWith]);

  const a = useRun(pixels, (signal) => analyse(pixels, signal));
  const chosen = printB && printB !== "looking" ? printB : null;

  return (
    <>
      <PrintB
        ctx={ctx}
        source={source}
        print={printB}
        picking={picking}
        onPicking={setPicking}
        onPick={(e) => {
          setPrintB(e);
          setPicking(false);
        }}
      />
      {chosen && <Match key={chosen.id} ctx={ctx} source={source} printB={chosen} a={a} onMarks={onMarks} />}
    </>
  );
}

/**
 * Fingerprint lab: two prints, each enhanced to a ridge skeleton and read for
 * minutiae on this device, then aligned and scored. The source is print A;
 * print B is picked from the case. The result pins as a side-by-side
 * comparison and a finding linked to both prints.
 */
export function FingerprintView({ ctx }: { ctx: ToolContext }) {
  // one demo per mount: StrictMode's second effect run reuses it, so print B is pinned once
  const demo = useRef<Promise<PinImage> | null>(null);
  const image = useToolImage(ctx, () => (demo.current ??= demoPair({ store: ctx.store, caseId: ctx.caseId, toolId: ctx.toolId })));
  const [marks, setMarks] = useState<Marks | null>(null);
  const ready = image.phase === "ready" ? image : null;
  const pixels = ready?.pixels;

  const notice = getToolSettings(ctx.settings, ctx.toolId, NOTICE_DEFAULTS);
  const acknowledge = () => ctx.updateSettings(setToolSettings(ctx.settings, ctx.toolId, { ...notice, fingerprintNoticeSeen: true }));

  const drawOverlay = useCallback(
    (g: CanvasRenderingContext2D) => {
      if (!marks || !pixels) return;
      const scale = pixels.width / marks.width;
      // sized in screen pixels, whatever the photo's own size
      const px = (window.devicePixelRatio || 1) / g.getTransform().a;
      const half = 3.5 * px;
      g.lineWidth = 1.5 * px;
      for (const p of marks.points) {
        g.strokeStyle = p.matched && marks.lit ? AMBER : BONE;
        g.strokeRect(p.x * scale - half, p.y * scale - half, 2 * half, 2 * half);
      }
    },
    [marks, pixels],
  );

  return (
    <ImageToolShell tool={fingerprintManifest} ctx={ctx} source={ready?.source} pixels={pixels} drawOverlay={marks ? drawOverlay : undefined}>
      {image.phase !== "error" && !notice.fingerprintNoticeSeen && <Notice onAck={acknowledge} />}
      {ready && notice.fingerprintNoticeSeen && <Lab key={ready.source.id} ctx={ctx} source={ready.source} pixels={ready.pixels} onMarks={setMarks} />}
      {image.phase === "error" && (
        <ToolPanel id="print" title="No print" lamp="amber">
          <p className="fp-problem" role="alert">
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
