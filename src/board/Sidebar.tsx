import { useEffect, useMemo, useState, type RefObject } from "react";
import type { Evidence, EvidenceType } from "../store/schema";
import { HudButton, Lamp } from "../ui/components";
import { Icon } from "../ui/icons";
import { exhibitSpoken, exhibitTag, TYPE_ICON } from "./EvidenceCard";

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
            <li key={e.id}>
              <button
                type="button"
                data-testid="sidebar-item"
                onClick={() => props.onPick(e)}
                className={`type-${e.type} ${e.id === props.selectedId ? "lit" : ""}`}
                aria-current={e.id === props.selectedId ? "true" : undefined}
                aria-label={`${exhibitSpoken(props.exhibits.get(e.id))}, ${e.title}`}
              >
                <Icon name={TYPE_ICON[e.type]} size={14} />
                <span className="sidebar-stamp num">{exhibitTag(props.exhibits.get(e.id))}</span>
                <span className="sidebar-title">{e.title}</span>
              </button>
            </li>
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
        </footer>
        </div>
      </aside>
    </>
  );
}
