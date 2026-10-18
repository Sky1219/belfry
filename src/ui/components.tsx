import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Panel(props: { title?: string; titleId?: string; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section className={`panel ${props.className ?? ""}`} style={props.style}>
      {props.title && (
        <div className="panel-title" id={props.titleId}>
          {props.title}
        </div>
      )}
      <div className="panel-body">{props.children}</div>
    </section>
  );
}

/**
 * Stepped deco corners: a doubled bracket at two opposite corners of the
 * parent (which must be positioned). Grows out of the panel's bracket language.
 */
export function DecoCorners(props: { tone?: "cyan" | "amber" }) {
  const cls = `deco-corner ${props.tone === "amber" ? "amber" : ""}`;
  return (
    <>
      <span className={`${cls} tl`} aria-hidden />
      <span className={`${cls} br`} aria-hidden />
    </>
  );
}

type HudButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  danger?: boolean;
  small?: boolean;
};

export function HudButton({ active, danger, small, className, ...rest }: HudButtonProps) {
  const cls = ["hud-btn", active && "active", danger && "danger", small && "small", className]
    .filter(Boolean)
    .join(" ");
  return <button type="button" className={cls} {...rest} />;
}

export type ChipState = "loading" | "ready" | "offline" | "off";

export function StatusChip(props: { state: ChipState; label?: string }) {
  return (
    <span className={`chip ${props.state}`} data-state={props.state}>
      <span className="chip-dot" />
      {props.label ? `${props.label} · ${props.state}` : props.state}
    </span>
  );
}

/** Circular progress ring, value in 0..1. */
export function ProgressRing(props: { value: number; size?: number; color?: string }) {
  const size = props.size ?? 36;
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, props.value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={2} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={props.color ?? "var(--cyan)"}
        strokeWidth={2}
        strokeDasharray={`${c * v} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function Toggle(props: { on: boolean; label: string; onChange: (on: boolean) => void; title?: string }) {
  return (
    <label
      className={`toggle ${props.on ? "on" : ""}`}
      title={props.title}
      role="switch"
      aria-checked={props.on}
      tabIndex={0}
      onClick={() => props.onChange(!props.on)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          props.onChange(!props.on);
        }
      }}
    >
      <span className="toggle-box" />
      {props.label}
    </label>
  );
}

/** True when the visitor asked the OS for less motion; used for JS-driven animation. */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
