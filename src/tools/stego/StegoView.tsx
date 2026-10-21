import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { runOp } from "../../platform/workers/compute";
import type { Evidence } from "../../store/schema";
import { Bezel, HudButton, type LampState } from "../../ui/components";
import { Icon } from "../../ui/icons";
import { encodeImage } from "../imagekit/decode";
import { ImageToolShell, ToolPanel } from "../imagekit/ImageToolShell";
import { pinResult, type PinDeps, type PinRequest } from "../imagekit/pin";
import type { Pixels } from "../imagekit/pixels";
import { useRun, type Run } from "../imagekit/useRun";
import { useToolImage } from "../imagekit/useToolImage";
import type { ToolContext } from "../types";
import { makeStegoDemo } from "./demo";
import { round2, stegoFinding } from "./finding";
import { CapacityError, capacityBytes, embed, opaqueChannels } from "./lsb";
import { stegoManifest } from "./manifest";
import "./stego.css";

const TOO_SMALL = "This image is too small to hold a message.";
const JPEG_NOTE = "Saved as PNG: a JPEG save would erase the message.";
const SHARE_PNG = "Share the PNG itself; re-saving it as JPEG destroys the message.";
/** The chart's two guides: the chi-square bands (spec §7). */
const GUIDES = [0.95, 0.5];

type Mode = "analyse" | "embed";
type Analysis = { finding: ReturnType<typeof stegoFinding>; chi: Array<{ fraction: number; p: number }> };

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;
/** What share of the image's opaque channels a message of `bytes` (plus its 8-byte header) takes, for the chart's key. */
function share(bytes: number, channels: number): string {
  const pct = channels > 0 ? (((8 + bytes) * 8) / channels) * 100 : 100;
  return pct < 1 ? "under 1%" : `${Math.min(100, Math.round(pct))}%`;
}
/** By its type or, failing that, its first two bytes (FF D8), so a misnamed JPEG still warns. */
const isJpeg = (mime: string, bytes: Uint8Array) => mime === "image/jpeg" || (bytes[0] === 0xff && bytes[1] === 0xd8);

/** Every pin from either panel waits for the one before, so each is placed clear of it. */
function usePinQueue(deps: PinDeps) {
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  return async (req: () => Promise<PinRequest>) => {
    const run = queue.current.catch(() => undefined).then(async () => pinResult(deps, await req()));
    queue.current = run;
    await run;
  };
}

function Working() {
  return <p className="label sg-working">Working</p>;
}

/**
 * The chi-square p for each share of the image read, as ten bars from 0 to 1
 * with the two bands marked. Amber only on a finding (a payload, or "consistent").
 */
function ChiChart(props: { chi: Array<{ fraction: number; p: number }>; lit: boolean; children?: ReactNode }) {
  return (
    <figure className="sg-chart" data-testid="chi-chart" data-lit={props.lit}>
      <figcaption className="label">Chi-square p by share of the image read</figcaption>
      <div className="sg-plot">
        <div className="sg-guides" aria-hidden>
          {GUIDES.map((g) => (
            <span key={g} className="sg-guide" style={{ bottom: `${g * 100}%` }}>
              <span className="num">{g.toFixed(2)}</span>
            </span>
          ))}
        </div>
        <ol className={`sg-bars ${props.lit ? "lit" : ""}`} aria-label="Chi-square p for each share read">
          {props.chi.map((e) => {
            // the same 2 dp rounding the finding bands on (Ruling P3-R1)
            const p = round2(e.p);
            const k = `${Math.round(e.fraction * 100)}%`;
            return (
              <li key={e.fraction} className="sg-col">
                <span className="sg-value num" aria-hidden data-testid="chi-value">
                  {p.toFixed(2)}
                </span>
                <span className="sg-track">
                  <span className="sg-fill" role="img" aria-label={`${k} read: p ${p.toFixed(2)}`} data-testid="chi-bar" style={{ height: `${p * 100}%` }} />
                </span>
                <span className="sg-k num" aria-hidden>
                  {k}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="label sg-key">{props.children}</p>
    </figure>
  );
}

/** Analyse: the payload if there is one, the chart and the finding, with its pin. */
function AnalysePanel(props: { run: Run<Analysis>; channels: number; onPin(): Promise<void>; pinned: number }) {
  const { run } = props;
  const result = run.state === "done" ? run.value : null;
  const f = result?.finding;
  const lit = f?.verdict === "payload" || f?.verdict === "consistent";
  const lamp: LampState = run.state === "working" ? "pulse" : run.state === "failed" || lit ? "amber" : "off";

  let readout = "RS --";
  if (f?.detail?.kind === "decode") readout = `${utf8Bytes(f.detail.text)} bytes`;
  else if (f?.detail?.kind === "measurement" && f.detail.value !== null) readout = `RS ${f.detail.value.toFixed(2)}`;

  return (
    <ToolPanel
      id="analyse"
      title="Hidden data"
      lamp={lamp}
      readout={<span className="num">{readout}</span>}
      onPin={result ? props.onPin : undefined}
      pinned={props.pinned}
    >
      {run.state === "working" && <Working />}
      {run.state === "failed" && (
        <p className="sg-problem" role="alert">
          Couldn&rsquo;t read this image: {run.message}
        </p>
      )}
      {result && f && (
        <>
          <ChiChart chi={result.chi} lit={lit}>
            Bars near 1: that share&rsquo;s low bits look embedded. Dashed: the 0.50 and 0.95 bands.
            {f.detail?.kind === "decode" && ` The message fills ${share(utf8Bytes(f.detail.text), props.channels)} of the low bits.`}
          </ChiChart>
          <div className="sg-finding">
            <p className={`sg-verdict ${lit ? "lit" : ""}`}>{f.title}</p>
            {f.detail?.kind === "decode" && (
              <div className="sg-message">
                <span className="label">Message · {f.detail.scheme}</span>
                <p className="sg-message-text">{f.detail.text}</p>
              </div>
            )}
            <p className="sg-body">{f.body}</p>
          </div>
        </>
      )}
    </ToolPanel>
  );
}

/** Embed: the message, what it costs against the image's room, and the key that hides it and pins the PNG. */
function EmbedPanel(props: {
  /** Message bytes the image can carry. */
  capacity: number;
  jpeg: boolean;
  message: string;
  onMessage(m: string): void;
  onEmbed(): Promise<void>;
  pinned: number;
}) {
  const { capacity, message } = props;
  const ids = useId();
  const bytes = useMemo(() => utf8Bytes(message), [message]);
  const over = bytes > capacity;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const hide = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await props.onEmbed();
    } catch (e) {
      setProblem(`Couldn't hide that: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const ready = bytes > 0 && !over && !busy;
  return (
    <ToolPanel id="embed" title="Hide a message" lamp="off">
      {capacity === 0 ? (
        <p className="sg-body">{TOO_SMALL}</p>
      ) : (
        <>
          <div className="col field sg-field">
            <label className="label" htmlFor={`${ids}-message`}>
              Message
            </label>
            <textarea
              id={`${ids}-message`}
              className="hud-input sg-input"
              rows={4}
              value={message}
              placeholder="What should the image carry?"
              aria-describedby={`${ids}-capacity`}
              aria-invalid={over}
              onChange={(e) => props.onMessage(e.target.value)}
              data-testid="embed-message"
            />
            <span id={`${ids}-capacity`} className={`sg-capacity num ${over ? "over" : ""}`} data-testid="embed-capacity">
              {`${bytes} of ${capacity} bytes`}
            </span>
          </div>
          {over && (
            <p className="sg-problem" role="alert">
              {/* both sides count the 8-byte header (Ruling P3-R5) */}
              {new CapacityError(8 + bytes, 8 + capacity).message}
            </p>
          )}
          <p className="sg-body">Pins a PNG copy of this photo with the message in its lowest bits.</p>
          {props.jpeg && <p className="sg-note">{JPEG_NOTE}</p>}
          <div className="ik-pin">
            <HudButton small active={ready} className="with-icon" disabled={!ready} onClick={hide} data-testid="embed-pin">
              <Icon name="stego" size={12} /> Hide and pin
            </HudButton>
            {!!props.pinned && <span className="plate steel num">{props.pinned > 1 ? `Pinned ×${props.pinned}` : "Pinned"}</span>}
            {problem && (
              <p className="ik-problem" role="alert">
                {problem}
              </p>
            )}
          </div>
        </>
      )}
    </ToolPanel>
  );
}

/** The two modes over one photo. The analysis runs once per photo; the typed message survives a mode switch. */
function Lab(props: { ctx: ToolContext; source: Evidence; bytes: Uint8Array; mime: string; pixels: Pixels }) {
  const { ctx, source, pixels } = props;
  const [mode, setMode] = useState<Mode>("analyse");
  const [message, setMessage] = useState("");
  const [pinned, setPinned] = useState({ analyse: 0, embed: 0 });
  const pin = usePinQueue({ store: ctx.store, caseId: ctx.caseId, toolId: ctx.toolId });
  // one linear pass each over the alpha channel, once per photo rather than per mode switch
  const channels = useMemo(() => opaqueChannels(pixels), [pixels]);
  const capacity = useMemo(() => capacityBytes(pixels), [pixels]);

  // one worker op reads the payload and runs both detectors (Ruling P3-R3)
  const analysis = useRun(pixels, async (signal): Promise<Analysis> => {
    const data = pixels.data.slice();
    const r = await runOp("stegoAnalyse", { width: pixels.width, height: pixels.height, data }, { signal, transfer: [data.buffer] });
    return { finding: stegoFinding(r), chi: r.chi };
  });

  const pinAnalysis = async () => {
    if (analysis.state !== "done") return;
    const { title, body, detail } = analysis.value.finding;
    await pin(async () => ({ source, finding: { title, body, detail } }));
    setPinned((p) => ({ ...p, analyse: p.analyse + 1 }));
  };

  // embedding is one linear pass on the main thread, then the PNG encode (Ruling P3-R3); never JPEG
  const embedAndPin = async () => {
    const text = message;
    const n = utf8Bytes(text);
    await pin(async () => {
      const stego = embed(pixels, text);
      const png = await encodeImage(stego, "image/png");
      return {
        source,
        image: {
          bytes: png,
          mime: "image/png",
          title: `${source.title} — with hidden message`,
          meta: { stego: "lsb", bytes: n, width: stego.width, height: stego.height },
        },
        finding: { title: `Message hidden (LSB, ${n} bytes)`, body: SHARE_PNG },
      };
    });
    setPinned((p) => ({ ...p, embed: p.embed + 1 }));
  };

  return (
    <>
      <div className="ik-panel">
        <Bezel title="Mode" titleId="sg-mode-title" lamp="off">
          <div className="panel-body sg-modes" role="group" aria-labelledby="sg-mode-title">
            {(["analyse", "embed"] as const).map((m) => (
              <HudButton key={m} small active={mode === m} aria-pressed={mode === m} onClick={() => setMode(m)} data-testid={`mode-${m}`}>
                {m === "analyse" ? "Analyse" : "Embed"}
              </HudButton>
            ))}
          </div>
        </Bezel>
      </div>
      {mode === "analyse" ? (
        <AnalysePanel run={analysis} channels={channels} onPin={pinAnalysis} pinned={pinned.analyse} />
      ) : (
        <EmbedPanel
          capacity={capacity}
          jpeg={isJpeg(props.mime, props.bytes)}
          message={message}
          onMessage={setMessage}
          onEmbed={embedAndPin}
          pinned={pinned.embed}
        />
      )}
    </>
  );
}

/**
 * Steganography lab: reads a photo for a Belfry LSB message and tests its low
 * bits with the chi-square attack and RS steganalysis, or hides a message in
 * it and pins the result as a PNG derived from the photo.
 */
export function StegoView({ ctx }: { ctx: ToolContext }) {
  const image = useToolImage(ctx, makeStegoDemo);
  const ready = image.phase === "ready" ? image : null;

  return (
    <ImageToolShell tool={stegoManifest} ctx={ctx} source={ready?.source} pixels={ready?.pixels}>
      {ready && <Lab key={ready.source.id} ctx={ctx} source={ready.source} bytes={ready.bytes} mime={ready.mime} pixels={ready.pixels} />}
      {image.phase === "error" && (
        <ToolPanel id="photo" title="No photo" lamp="amber">
          <p className="sg-problem" role="alert">
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
