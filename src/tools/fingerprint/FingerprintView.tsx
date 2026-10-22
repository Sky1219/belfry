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
import { usePinQueue } from "../imagekit/usePinQueue";
import { useRun, type Run } from "../imagekit/useRun";
import { useToolImage } from "../imagekit/useToolImage";
import type { ToolContext } from "../types";
import { makeFingerprintDemo } from "./demo";
import { fingerprintManifest } from "./manifest";
import { drawComparison, pairStyle, type PairStyle, type Print } from "./comparison";
import { fingerprintFinding, type MatchInput } from "./match";
import "./fingerprint.css";

const NOTICE = "Compare your own prints only. Prints are processed on this device and never leave it. This is not an identification.";
const ACK = "I'm comparing my own prints";
const NOTICE_DEFAULTS = { fingerprintNoticeSeen: false };
/** Each print is analysed at this long side at most (spec §1). */
const ANALYSIS_SIDE = 640;
// mirrored from the theme for the Source marks
const AMBER = "#ffa733";
const BONE = "#ece6dc";

/**
 * When the notice was last acknowledged, until print B's panel takes focus. Kept outside the
 * view because the demo opens on its own route and then hops to print A's, which remounts the
 * view; an acknowledgement older than FOCUS_AFTER_ACK_MS no longer moves focus.
 */
let noticeAckedAt = -Infinity;
const FOCUS_AFTER_ACK_MS = 30_000;

/** What can take focus inside a panel; the picker's hidden file input is left out. */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([hidden]):not([type="hidden"]), [tabindex]:not([tabindex="-1"])';

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

/** The comparison on the panel's glass, at its own pixel size; CSS fits it to the column. */
function ComparisonCanvas(props: { image: OffscreenCanvas; style: PairStyle }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { image, style } = props;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = image.width;
    c.height = image.height;
    c.getContext("2d")!.drawImage(image, 0, 0);
  }, [image]);
  return (
    <canvas
      ref={ref}
      className="fp-compare"
      role="img"
      aria-label={`Print A and print B side by side. ${style.key}.`}
      data-testid="fp-comparison"
      data-pairs={style.lines}
    />
  );
}

/** Print A's minutiae, in the photo's own coordinates, for the Source screen. */
interface Marks {
  /** The width print A was analysed at; the points are in its pixels. */
  width: number;
  points: Array<{ x: number; y: number; matched: boolean }>;
  /** Matched minutiae are amber only on a "consistent with" verdict (amber marks a finding). */
  lit: boolean;
}

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
  /** Move focus to this panel's first control once it has settled (after the notice is acknowledged). */
  focus: boolean;
  onFocused(): void;
}) {
  const { ctx, source, print, picking, focus, onFocused } = props;
  const chosen = print && print !== "looking" ? print : null;

  // The notice that held focus is gone: hand it to the first control here, once print B is
  // looked up and the picker (if shown) has listed the case's photos, so it lands on the first row.
  const panel = useRef<HTMLDivElement>(null);
  const looking = print === "looking";
  useEffect(() => {
    const root = panel.current;
    if (!focus || looking || !root) return;
    const settle = () => {
      if (root.querySelector('[aria-busy="true"]')) return false;
      const target = root.querySelector<HTMLElement>(FOCUSABLE);
      if (!target) return false;
      target.focus();
      onFocused();
      return true;
    };
    if (settle()) return;
    const watch = new MutationObserver(() => settle() && watch.disconnect());
    watch.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
    return () => watch.disconnect();
  }, [focus, looking, onFocused]);
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
    // display: contents, so the wrapper (there to find the panel's controls) leaves the layout alone
    <div ref={panel} className="fp-panel-wrap">
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
    </div>
  );
}

/** What the match worker needs from a print: not its skeleton or gray, which stay here for drawing. */
const matchInput = (p: Print): MatchInput => ({ minutiae: p.analysis.minutiae, medianFrequency: p.analysis.medianFrequency });

/** Print B's analysis, the match, and its finding, comparison and pin. Keyed by print B. */
function Match(props: { ctx: ToolContext; source: Evidence; printB: Evidence; a: Run<Print>; onMarks(m: Marks | null): void }) {
  const { ctx, source, printB, a, onMarks } = props;
  const b = useRun(printB.id, async (signal) => {
    const pixels = await decodeImage(await readEvidenceBlob(ctx.store, printB));
    return analyse(pixels, signal);
  });

  const pa = a.state === "done" ? a.value : null;
  const pb = b.state === "done" ? b.value : null;
  // matching is a worker op (Ruling P2-R10): a few hundred minutiae would hold the main thread for seconds
  const pair = useMemo(() => (pa && pb ? { pa, pb } : null), [pa, pb]);
  const matching = useRun(pair, async (signal) => {
    if (!pair) return null;
    const { pa, pb } = pair;
    const m = await runOp("fingerprintMatch", { a: matchInput(pa), b: matchInput(pb) }, { signal });
    const finding = fingerprintFinding(pa.analysis.minutiae, pb.analysis.minutiae, m);
    const style = pairStyle(finding, m.matched);
    return { m, finding, style, image: drawComparison(pa, pb, m, style) };
  });
  const result = matching.state === "done" ? matching.value : null;

  const consistent = result?.finding.verdict === "consistent";
  useEffect(() => {
    if (!result || !pa) return onMarks(null);
    // with too little ridge detail there are no pairs to mark (Ruling P2-R7)
    const matched = new Set(result.style.lines === "none" ? [] : result.m.pairs.map(([i]) => i));
    onMarks({
      width: pa.analysis.width,
      points: pa.analysis.minutiae.map((q, i) => ({ x: q.x, y: q.y, matched: matched.has(i) })),
      lit: result.style.lines === "amber",
    });
  }, [result, pa, onMarks]);
  useEffect(() => () => onMarks(null), [onMarks]);

  // pins wait for the one before, so each is placed clear of it
  const queue = usePinQueue();
  const [pinned, setPinned] = useState(0);
  const pin = async () => {
    if (!result) return;
    const { finding, image, m, style } = result;
    const prints = [source.id, printB.id];
    await queue(async () => {
      const blob = await image.convertToBlob({ type: "image/png" });
      const pinnedResult = await pinResult(
        { store: ctx.store, caseId: ctx.caseId, toolId: ctx.toolId },
        {
          source,
          image: {
            bytes: new Uint8Array(await blob.arrayBuffer()),
            mime: "image/png",
            title: "Fingerprint comparison",
            meta: { map: "fingerprint", prints, pairs: style.lines, matched: m.matched, width: image.width, height: image.height },
          },
          finding: { title: finding.title, body: finding.body, detail: finding.detail, meta: { prints } },
        },
      );
      // the finding rests on both prints: print A through the comparison, print B directly
      await ctx.store.addLink({ caseId: ctx.caseId, fromId: pinnedResult.finding.id, toId: printB.id, kind: "derived-from" });
    });
    setPinned((n) => n + 1);
  };

  const failed = [a, b, matching].find((r): r is Extract<Run<unknown>, { state: "failed" }> => r.state === "failed") ?? null;
  const lamp: LampState = failed || consistent ? "amber" : result ? "off" : "pulse";
  // the rounded score whenever one exists, the P2-R2 cell included (Ruling P2-R8)
  const score = result?.finding.score ?? null;

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
          <ComparisonCanvas image={result.image} style={result.style} />
          <p className="label fp-key">{result.style.key}</p>
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
function Lab(props: {
  ctx: ToolContext;
  source: Evidence;
  pixels: Pixels;
  onMarks(m: Marks | null): void;
  focusPrintB: boolean;
  onFocused(): void;
}) {
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
    // only a partner in this case: an older copy-imported case may still name one in the original
    ctx.store.getEvidence(pairWith).then(
      (e) => alive && setPrintB(e && e.type === "image" && e.id !== source.id && e.caseId === ctx.caseId ? e : null),
      () => alive && setPrintB(null),
    );
    return () => {
      alive = false;
    };
  }, [ctx.store, ctx.caseId, source.id, pairWith]);

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
        focus={props.focusPrintB}
        onFocused={props.onFocused}
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
  // the acknowledge key unmounts with the notice, so focus moves on to print B's panel, even
  // when the acknowledgement came during the demo's hop to print A (which remounts this view)
  const [focusPrintB, setFocusPrintB] = useState(() => performance.now() - noticeAckedAt < FOCUS_AFTER_ACK_MS);
  const focused = useCallback(() => {
    noticeAckedAt = -Infinity;
    setFocusPrintB(false);
  }, []);
  const acknowledge = () => {
    noticeAckedAt = performance.now();
    setFocusPrintB(true);
    ctx.updateSettings(setToolSettings(ctx.settings, ctx.toolId, { ...notice, fingerprintNoticeSeen: true }));
  };

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
      {ready && notice.fingerprintNoticeSeen && (
        <Lab
          key={ready.source.id}
          ctx={ctx}
          source={ready.source}
          pixels={ready.pixels}
          onMarks={setMarks}
          focusPrintB={focusPrintB}
          onFocused={focused}
        />
      )}
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
