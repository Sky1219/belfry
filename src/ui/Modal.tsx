import { useEffect, useId, useRef, type ReactNode } from "react";
import { Panel } from "./components";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open modals, innermost last; only the innermost one answers Escape and traps Tab. */
const stack: symbol[] = [];

/** True while any modal is open (board shortcuts stand down). */
export const modalOpen = () => stack.length > 0;

/**
 * A bracketed pane in front of everything: labelled dialog semantics, Tab
 * trapped inside, Escape closes it, and focus returns to whatever opened it.
 */
export function Modal(props: { title: string; onClose: () => void; className?: string; children: ReactNode; testId?: string }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;

  useEffect(() => {
    const me = Symbol("modal");
    stack.push(me);
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current!;
    // React has already focused any autoFocus child during commit; otherwise take the first control.
    if (!root.contains(document.activeElement)) (root.querySelector<HTMLElement>(FOCUSABLE) ?? root).focus();

    // Capture phase on window runs before any other window listener (tool shortcuts, Escape-to-board).
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && (i <= 0)) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && (i === -1 || i === items.length - 1)) {
        e.preventDefault();
        items[0].focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      stack.splice(stack.indexOf(me), 1);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`modal ${props.className ?? ""}`}
        data-testid={props.testId}
      >
        <Panel title={props.title} titleId={titleId}>
          {props.children}
        </Panel>
      </div>
    </div>
  );
}
