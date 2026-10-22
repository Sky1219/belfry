import { useEffect, useRef, useState, type ReactNode } from "react";
import { exhibitTag } from "../../board/EvidenceCard";
import type { Evidence } from "../../store/schema";
import { Bezel, HudButton, type LampState } from "../../ui/components";
import { Icon } from "../../ui/icons";
import type { ToolContext, ToolManifest } from "../types";
import type { Pixels } from "./pixels";
import "./imagekit.css";

/** The photo on a bezelled screen, scaled to fit, with the tool's overlay drawn over it. */
function SourceScreen(props: { pixels?: Pixels; drawOverlay?: (g: CanvasRenderingContext2D) => void; layer?: ReactNode }) {
  const { pixels, drawOverlay } = props;
  const boxRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [drawFailed, setDrawFailed] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // decoded once per photo; resizing only redraws from this bitmap
  useEffect(() => {
    setBitmap(null);
    setDrawFailed(false);
    if (!pixels) return;
    let alive = true;
    let made: ImageBitmap | undefined;
    createImageBitmap(new ImageData(pixels.data as Uint8ClampedArray<ArrayBuffer>, pixels.width, pixels.height)).then(
      (b) => {
        if (alive) setBitmap((made = b));
        else b.close();
      },
      // out of memory, say: the screen says so instead of staying blank
      () => alive && setDrawFailed(true),
    );
    return () => {
      alive = false;
      made?.close();
    };
  }, [pixels]);

  const scale = pixels && box.w > 0 && box.h > 0 ? Math.min(box.w / pixels.width, box.h / pixels.height) : 0;
  const cssW = pixels ? Math.max(1, Math.floor(pixels.width * scale)) : 0;
  const cssH = pixels ? Math.max(1, Math.floor(pixels.height * scale)) : 0;

  useEffect(() => {
    const photo = photoRef.current;
    const overlay = overlayRef.current;
    if (!pixels || !bitmap || !photo || !overlay || scale <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    for (const c of [photo, overlay]) {
      c.width = w;
      c.height = h;
    }
    const pg = photo.getContext("2d")!;
    pg.imageSmoothingQuality = "high";
    pg.drawImage(bitmap, 0, 0, w, h);
    const og = overlay.getContext("2d")!;
    og.clearRect(0, 0, w, h);
    if (drawOverlay) {
      // the overlay is drawn in the photo's own pixel coordinates
      og.save();
      og.scale(w / pixels.width, h / pixels.height);
      drawOverlay(og);
      og.restore();
    }
  }, [pixels, bitmap, scale, cssW, cssH, drawOverlay]);

  return (
    <div className="ik-stage" ref={boxRef}>
      {pixels && drawFailed ? (
        <p className="ik-problem" role="alert" data-testid="source-draw-failed">
          This photo couldn&rsquo;t be drawn.
        </p>
      ) : pixels ? (
        <div className="ik-photo" style={{ width: cssW, height: cssH }}>
          <canvas ref={photoRef} className="ik-canvas" data-testid="source-canvas" role="img" aria-label="The photo under analysis" />
          <canvas ref={overlayRef} className="ik-canvas ik-overlay" aria-hidden />
          {props.layer}
        </div>
      ) : (
        <p className="ik-blank">No photo</p>
      )}
    </div>
  );
}

/**
 * The frame every image tool sits in: a title plate naming the tool and the
 * exhibit it is looking at, the photo on its own screen, the tool's test
 * panels in a column beside it, and a key back to the board.
 */
export function ImageToolShell(props: {
  tool: ToolManifest;
  ctx: ToolContext;
  source?: Evidence;
  pixels?: Pixels;
  /** Draws over the photo, in the photo's own pixel coordinates. */
  drawOverlay?: (g: CanvasRenderingContext2D) => void;
  /** Interactive pieces set exactly over the photo (marks to drag), sized to it. */
  screenLayer?: ReactNode;
  children: ReactNode;
}) {
  const { tool, ctx, source } = props;
  const [exhibit, setExhibit] = useState<number | undefined>();

  useEffect(() => {
    if (!source) return setExhibit(undefined);
    let alive = true;
    ctx.store.exhibitNumbers(ctx.caseId).then((m) => alive && setExhibit(m.get(source.id)));
    return () => {
      alive = false;
    };
  }, [ctx.store, ctx.caseId, source]);

  const demo = !!source?.tags.includes("demo");
  return (
    <div className="ik-root" data-testid="image-tool" data-tool={tool.id}>
      <header className="ik-top">
        <div className="ik-title">
          <span className="ik-name" data-testid="tool-title">
            {tool.name.toUpperCase()}
            {source ? ` · ${exhibitTag(exhibit)}` : ""}
          </span>
          {demo && <span className="plate amber">Demo</span>}
        </div>
        <HudButton small className="with-icon" onClick={ctx.close} data-testid="tool-close">
          <Icon name="close" size={12} /> Board
        </HudButton>
      </header>
      <div className="ik-body">
        <Bezel
          title="Source"
          titleId="ik-source-title"
          lamp={props.pixels ? "on" : "off"}
          className="ik-source"
          meta={props.pixels && <span className="num">{`${props.pixels.width} × ${props.pixels.height}`}</span>}
        >
          <SourceScreen pixels={props.pixels} drawOverlay={props.drawOverlay} layer={props.screenLayer} />
        </Bezel>
        <div className="ik-panels">{props.children}</div>
      </div>
    </div>
  );
}

/**
 * One test's screen: a lamp for how it came out, a readout, the test's own
 * display, and a key that pins its result to the board. A failed pin says so
 * on the panel instead of vanishing.
 */
export function ToolPanel(props: {
  id: string;
  title: string;
  lamp: LampState;
  readout?: ReactNode;
  onPin?: () => Promise<void>;
  /** How many results this panel has pinned so far. */
  pinned?: number;
  /** Holds the pin key off, say while the result is being recomputed. */
  pinDisabled?: boolean;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pin = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await props.onPin?.();
    } catch (e) {
      setProblem(`Couldn't pin that: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ik-panel" data-testid={`panel-${props.id}`}>
      <Bezel title={props.title} titleId={`ik-panel-${props.id}`} lamp={props.lamp} meta={props.readout}>
        <div className="panel-body col">
          {/* a live region from the start, so a screen reader hears the result replace "Working" */}
          <div className="col ik-result" aria-live="polite" data-testid={`result-${props.id}`}>
            {props.children}
          </div>
          {props.onPin && (
            <div className="ik-pin">
              <HudButton small className="with-icon" disabled={busy || props.pinDisabled} onClick={pin} data-testid={`pin-${props.id}`}>
                <Icon name="finding" size={12} /> Pin to board
              </HudButton>
              {!!props.pinned && <span className="plate steel num">{props.pinned > 1 ? `Pinned ×${props.pinned}` : "Pinned"}</span>}
              {problem && (
                <p className="ik-problem" role="alert">
                  {problem}
                </p>
              )}
            </div>
          )}
        </div>
      </Bezel>
    </div>
  );
}
