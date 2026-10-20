import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useBlobUrl } from "../app/storeContext";
import type { Evidence, EvidenceType } from "../store/schema";
import { HudButton, Lamp } from "../ui/components";
import { Icon } from "../ui/icons";
import {
  exhibitSpoken,
  exhibitTag,
  findingReadout,
  provenanceLabel,
  TYPE_ICON,
  typeLabel,
  when,
  type CardMenuItem,
} from "./EvidenceCard";

const TYPES: Array<{ value: EvidenceType | "all"; label: string }> = [
  { value: "all", label: "All types" },
  { value: "image", label: "Images" },
  { value: "video", label: "Footage" },
  { value: "audio", label: "Audio" },
  { value: "note", label: "Notes" },
  { value: "finding", label: "Findings" },
];

export function matchesSearch(e: Evidence, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [e.title, e.body ?? "", ...e.tags].some((f) => f.toLowerCase().includes(s));
}

/**
 * The evidence index: a console beside the wall on wide screens, a drawer
 * over it on narrow ones.
 */
export function Sidebar(props: {
  id?: string;
  evidence: Evidence[];
  exhibits: Map<string, number>;
  onPick: (e: Evidence) => void;
  selectedId?: string;
  open?: boolean;
  onClose?: () => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  onFilter?: (matches: Set<string> | null) => void;
  /** A one-click action on a row, e.g. "Send to Detective Vision" for footage. */
  rowAction?: (e: Evidence) => { label: string; onSelect: () => void } | null | undefined;
  /** The exhibit whose row is open to its full content (the single selection on the wall). */
  expandedId?: string;
  /** Every action the exhibit's card menu offers, shown in its open row. */
  actionsFor?: (e: Evidence) => CardMenuItem[];
  /** Exhibit number each piece was derived from, for the open row's provenance. */
  sourceExhibits?: Map<string, number>;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<EvidenceType | "all">("all");
  const list = useMemo(
    () => props.evidence.filter((e) => (type === "all" || e.type === type) && matchesSearch(e, q)),
    [props.evidence, q, type],
  );
  const filtered = q.trim() !== "" || type !== "all";
  const total = props.evidence.length;

  // Tell the board which exhibits match, so it can dim the rest on the wall.
  const { onFilter } = props;
  const matchKey = filtered ? list.map((e) => e.id).join(",") : null;
  useEffect(() => {
    onFilter?.(matchKey === null ? null : new Set(matchKey ? matchKey.split(",") : []));
  }, [matchKey, onFilter]);

  // Escape closes the drawer (when it is a drawer).
  const { open, onClose } = props;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {props.open && <div className="drawer-scrim" onClick={props.onClose} aria-hidden />}
      <aside id={props.id} className={`sidebar bezel ${props.open ? "open" : ""}`} aria-labelledby="screen-index">
        <div className="bezel-head">
          <Lamp state={filtered ? "on" : "off"} />
          <h2 className="bezel-title" id="screen-index">
            Evidence
          </h2>
          <span className="bezel-meta num" data-testid="evidence-count">
            {filtered ? `${list.length} of ${total}` : String(total).padStart(2, "0")}
          </span>
          <HudButton small className="with-icon icon-only drawer-close" aria-label="Close evidence index" onClick={props.onClose}>
            <Icon name="close" size={12} />
          </HudButton>
        </div>
        <div className="screen sidebar-screen">
        <div className="col sidebar-filters">
          <input
            ref={props.searchRef}
            className="hud-input"
            type="search"
            placeholder="Search title, text, tags"
            aria-label="Search evidence"
            aria-keyshortcuts="/"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="evidence-search"
          />
          <select
            className="hud-input"
            aria-label="Evidence type"
            value={type}
            onChange={(e) => setType(e.target.value as EvidenceType | "all")}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        {list.length > 0 && (
        <ul className="sidebar-list">
          {list.map((e) => (
            <IndexRow key={e.id} expanded={e.id === props.expandedId}>
              <button
                type="button"
                data-testid="sidebar-item"
                onClick={() => props.onPick(e)}
                className={`sidebar-row type-${e.type} ${e.id === props.selectedId ? "lit" : ""}`}
                aria-current={e.id === props.selectedId ? "true" : undefined}
                aria-expanded={e.id === props.expandedId}
                aria-controls={e.id === props.expandedId ? `exhibit-detail-${e.id}` : undefined}
                aria-label={`${exhibitSpoken(props.exhibits.get(e.id))}, ${e.title}`}
              >
                <Icon name={TYPE_ICON[e.type]} size={14} />
                <span className="sidebar-stamp num">{exhibitTag(props.exhibits.get(e.id))}</span>
                <span className="sidebar-title">{e.title}</span>
              </button>
              {(() => {
                const send = props.rowAction?.(e);
                return send ? (
                  <button type="button" className="row-send" onClick={send.onSelect} aria-label={`${send.label}: ${e.title}`} title={send.label} data-testid="row-send">
                    <Icon name="vision" size={14} />
                  </button>
                ) : null;
              })()}
              {e.id === props.expandedId && (
                <RowDetail e={e} sourceExhibit={props.sourceExhibits?.get(e.id)} actions={props.actionsFor?.(e) ?? []} />
              )}
            </IndexRow>
          ))}
        </ul>
        )}
        {list.length === 0 && (
          <div className="sidebar-empty">
            {total === 0 ? (
              <p className="dim">No exhibits yet. They’ll be listed here as you pin them.</p>
            ) : (
              <>
                <p className="dim">No exhibits match.</p>
                <HudButton
                  small
                  onClick={() => {
                    setQ("");
                    setType("all");
                  }}
                >
                  Clear filters
                </HudButton>
              </>
            )}
          </div>
        )}
        <footer className="sidebar-keys" aria-label="Keyboard shortcuts">
          <span>
            <kbd>N</kbd> note
          </span>
          <span>
            <kbd>E</kbd> files
          </span>
          <span>
            <kbd>/</kbd> search
          </span>
          <span>
            <kbd>Ctrl</kbd>
            <kbd>Z</kbd> undo
          </span>
          <span className="keys-hint">Drag from a card&rsquo;s side stud to another card to link them.</span>
        </footer>
        </div>
      </aside>
    </>
  );
}

/** An index row; when it opens, it scrolls into view (selecting on the wall opens it too). */
function IndexRow(props: { expanded: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (props.expanded) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [props.expanded]);
  return (
    <li ref={ref} className={props.expanded ? "open" : ""}>
      {props.children}
    </li>
  );
}

/**
 * The full exhibit, read in the index: the wall is the map and this is the
 * page. Text is never clamped here, audio plays, and every card action is one
 * press away.
 */
function RowDetail(props: { e: Evidence; sourceExhibit?: number; actions: CardMenuItem[] }) {
  const { e } = props;
  const picture = useBlobUrl(e.type === "image" ? (e.blobHash ?? e.thumbHash) : e.type === "video" ? e.thumbHash : undefined);
  const audio = useBlobUrl(e.type === "audio" ? e.blobHash : undefined);
  const readout = findingReadout(e);
  return (
    <section className={`sidebar-detail type-${e.type}`} id={`exhibit-detail-${e.id}`} aria-label={`${e.title}, full exhibit`} data-testid="sidebar-detail">
      <span className="detail-type">
        <Icon name={TYPE_ICON[e.type]} size={12} />
        {typeLabel(e)}
      </span>
      <h3 className="detail-title">{e.title}</h3>
      {picture && <img className="detail-picture" src={picture} alt="" draggable={false} />}
      {audio && <audio className="detail-audio" controls src={audio} aria-label={`Play ${e.title}`} />}
      {readout && <p className="card-readout num">{readout}</p>}
      {e.body && <p className="detail-body">{e.body}</p>}
      {e.tags.length > 0 && (
        <div className="card-tags">
          {e.tags.map((t) => (
            <span key={t} className="card-tag">
              #{t}
            </span>
          ))}
        </div>
      )}
      <p className="detail-foot">
        <span className="num">{when(e.provenance.createdAt || e.createdAt)}</span>
        <span>{provenanceLabel(e, props.sourceExhibit)}</span>
      </p>
      {props.actions.length > 0 && (
        <div className="detail-actions" role="group" aria-label={`Actions for ${e.title}`}>
          {props.actions.map((m) => (
            <HudButton key={m.label} small danger={m.danger} data-testid={m.testId ? `index-${m.testId}` : undefined} onClick={m.onSelect}>
              {m.label}
            </HudButton>
          ))}
        </div>
      )}
    </section>
  );
}
