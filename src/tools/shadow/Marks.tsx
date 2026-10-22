import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Pixels } from "../imagekit/pixels";
import type { Marks } from "./demo";
import type { Pt } from "./shadow";

export type MarkKey = keyof Marks;

export const MARK_ORDER: MarkKey[] = ["base", "top", "tip"];
export const MARK_LABEL: Record<MarkKey, string> = { base: "BASE", top: "TOP", tip: "TIP" };
const MARK_ROLE: Record<MarkKey, string> = {
  base: "Base of the object",
  top: "Top of the object",
  tip: "Tip of its shadow",
};
const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Where an uploaded photo's marks wait before they are placed: an upright line and a shadow beside it. */
export function parkedMarks(p: Pick<Pixels, "width" | "height">): Marks {
  const { width: w, height: h } = p;
  return {
    base: { x: Math.round(w * 0.4), y: Math.round(h * 0.78) },
    top: { x: Math.round(w * 0.4), y: Math.round(h * 0.3) },
    tip: { x: Math.round(w * 0.66), y: Math.round(h * 0.78) },
  };
}

const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, v));

/**
 * The three marks over the photo, in its own pixel coordinates: keys to drag, or to nudge with
 * the arrow keys (1 px, Shift for 10), and the object and shadow lines between them.
 */
export function MarksLayer(props: {
  pixels: Pick<Pixels, "width" | "height">;
  marks: Marks;
  onMove(key: MarkKey, at: Pt): void;
  /** Id of the line that says how to use the marks. */
  describedBy?: string;
}) {
  const { width: w, height: h } = props.pixels;
  const { base, top, tip } = props.marks;
  const layer = useRef<HTMLDivElement>(null);
  // where in the mark the pointer took hold, so a grab never jumps the mark to the pointer
  const grip = useRef({ dx: 0, dy: 0 });
  const [dragging, setDragging] = useState<MarkKey | null>(null);

  const toPhoto = (e: PointerEvent) => {
    const r = layer.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };
  const move = (key: MarkKey, x: number, y: number) => props.onMove(key, { x: clamp(x, w), y: clamp(y, h) });

  const down = (key: MarkKey) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPhoto(e);
    grip.current = { dx: p.x - props.marks[key].x, dy: p.y - props.marks[key].y };
    setDragging(key);
  };
  const drag = (key: MarkKey) => (e: PointerEvent<HTMLButtonElement>) => {
    if (dragging !== key) return;
    const p = toPhoto(e);
    move(key, p.x - grip.current.dx, p.y - grip.current.dy);
  };
  const release = () => setDragging(null);
  const nudge = (key: MarkKey) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = NUDGE[e.key];
    if (!step) return;
    e.preventDefault();
    const by = e.shiftKey ? 10 : 1;
    const at = props.marks[key];
    move(key, at.x + step[0] * by, at.y + step[1] * by);
  };

  return (
    <div className="sh-marks" ref={layer}>
      <svg className="sh-lines" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
        <line className="sh-object" x1={base.x} y1={base.y} x2={top.x} y2={top.y} vectorEffect="non-scaling-stroke" />
        <line className="sh-shadow" x1={base.x} y1={base.y} x2={tip.x} y2={tip.y} vectorEffect="non-scaling-stroke" />
      </svg>
      {MARK_ORDER.map((key) => {
        const at = props.marks[key];
        return (
          <button
            key={key}
            type="button"
            className={`sh-mark sh-mark-${key} ${dragging === key ? "dragging" : ""}`}
            style={{ left: `${(at.x / w) * 100}%`, top: `${(at.y / h) * 100}%` }}
            aria-label={`${MARK_ROLE[key]}, at ${Math.round(at.x)}, ${Math.round(at.y)}`}
            aria-describedby={props.describedBy}
            onPointerDown={down(key)}
            onPointerMove={drag(key)}
            onPointerUp={release}
            onPointerCancel={release}
            onLostPointerCapture={release}
            onKeyDown={nudge(key)}
            data-testid={`mark-${key}`}
          >
            <span className="sh-cross" aria-hidden />
            <span className="sh-tag" aria-hidden>
              {MARK_LABEL[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
