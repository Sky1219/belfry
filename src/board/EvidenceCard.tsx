import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo, useEffect, useRef, useState } from "react";
import { useBlobUrl } from "../app/storeContext";
import type { Evidence, EvidenceType } from "../store/schema";
import { DecoCorners } from "../ui/components";
import { Icon, type IconName } from "../ui/icons";

export const TYPE_ICON: Record<EvidenceType, IconName> = {
  image: "image",
  video: "video",
  audio: "audio",
  note: "note",
  finding: "finding",
};

export const TYPE_LABEL: Record<EvidenceType, string> = {
  image: "Image",
  video: "Footage",
  audio: "Audio",
  note: "Note",
  finding: "Finding",
};

/** "EXH·007": exhibit numbers are per case and never reused. */
export const exhibitTag = (n: number | undefined) => (n ? `EXH·${String(n).padStart(3, "0")}` : "EXH·—");

const TOOL_NAMES: Record<string, string> = { "detective-vision": "Detective Vision" };

const when = (ms: number) => {
  const d = new Date(ms);
  const day = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }).toUpperCase();
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} · ${time}`;
};

export interface CardMenuItem {
  label: string;
  danger?: boolean;
  testId?: string;
  onSelect: () => void;
}

export type CardData = {
  evidence: Evidence;
  menu: CardMenuItem[];
  exhibit?: number;
  /** Exhibit number of the evidence this was derived from, when known. */
  sourceExhibit?: number;
  /** Arrived while the board was open: plays the pin-drop once. */
  arriving?: boolean;
};

export type CardNode = Node<CardData, "evidence">;

/** Where an exhibit came from, in the card's footer. */
export function provenanceLabel(e: Evidence, sourceExhibit?: number): string {
  if (e.tags.includes("demo") && !e.provenance.toolId) return "Staged";
  const parts: string[] = [];
  if (e.provenance.toolId) parts.push(TOOL_NAMES[e.provenance.toolId] ?? e.provenance.toolId);
  if (e.meta?.source === "local") parts.push("Local analysis");
  if (sourceExhibit) parts.push(`from ${exhibitTag(sourceExhibit)}`);
  if (!parts.length) parts.push(e.meta?.filename ? "Imported file" : "Pinned by hand");
  return parts.join(" · ");
}

function EvidenceCardImpl({ data, selected }: NodeProps<CardNode>) {
  const e = data.evidence;
  const thumb = useBlobUrl(e.thumbHash ?? (e.type === "image" ? e.blobHash : undefined));
  const finding = e.type === "finding";

  return (
    <article
      className={`evidence-card type-${e.type} ${selected ? "selected" : ""} ${data.arriving ? "arriving" : ""}`}
      data-testid="evidence-card"
      data-type={e.type}
    >
      <DecoCorners tone={finding ? "amber" : "cyan"} />
      <Handle type="target" position={Position.Left} />
      <header className="card-head">
        <span className="card-stamp" data-testid="exhibit-tag">
          {exhibitTag(data.exhibit)}
        </span>
        <span className="card-type">
          <Icon name={TYPE_ICON[e.type]} size={12} />
          {TYPE_LABEL[e.type]}
        </span>
        <CardMenu title={e.title} items={data.menu} />
      </header>
      <h3 className="card-title">{e.title}</h3>
      {thumb && <img className="card-thumb" src={thumb} alt="" draggable={false} />}
      {!thumb && (e.type === "video" || e.type === "audio") && (
        <div className="card-thumb placeholder">
          <Icon name={TYPE_ICON[e.type]} size={20} />
          <span>{e.type === "audio" ? "Audio recording" : "No preview"}</span>
        </div>
      )}
      {e.body && <p className="card-body">{e.body}</p>}
      <footer className="card-foot">
        <span className="card-when">{when(e.provenance.createdAt || e.createdAt)}</span>
        <span className="card-src">{provenanceLabel(e, data.sourceExhibit)}</span>
      </footer>
      {e.tags.length > 0 && (
        <div className="card-tags">
          {e.tags.map((t) => (
            <span key={t} className="card-tag">
              #{t}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </article>
  );
}

/** The card's actions: a real menu button with Escape, outside-click and arrow-key handling. */
function CardMenu(props: { title: string; items: CardMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDown = (ev: PointerEvent) => {
      if (!menu.current?.contains(ev.target as HTMLElement) && !btn.current?.contains(ev.target as HTMLElement)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };

  const onKeyDown = (ev: React.KeyboardEvent) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (ev.key === "Escape") {
      ev.stopPropagation();
      close(true);
    } else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const d = ev.key === "ArrowDown" ? 1 : -1;
      items[(i + d + items.length) % items.length]?.focus();
    } else if (ev.key === "Home" || ev.key === "End") {
      ev.preventDefault();
      (ev.key === "Home" ? items[0] : items[items.length - 1])?.focus();
    } else if (ev.key === "Tab") {
      setOpen(false);
    }
    // Keep arrow keys and Delete from reaching the board (which would move or delete the card).
    ev.stopPropagation();
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="card-menu-btn nodrag"
        aria-label={`Actions for ${props.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="card-menu"
        onClick={(ev) => {
          ev.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div ref={menu} className="card-menu nodrag nowheel" role="menu" aria-label={`Actions for ${props.title}`} onKeyDown={onKeyDown}>
          {props.items.map((m) => (
            <button
              key={m.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={m.danger ? "danger" : ""}
              data-testid={m.testId}
              onClick={(ev) => {
                ev.stopPropagation();
                close(true);
                m.onSelect();
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export const EvidenceCard = memo(EvidenceCardImpl);
