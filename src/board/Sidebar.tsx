import { useMemo, useState } from "react";
import type { Evidence, EvidenceType } from "../store/schema";
import { TYPE_ICON } from "./EvidenceCard";

const TYPES: Array<EvidenceType | "all"> = ["all", "image", "video", "audio", "note", "finding"];

export function matchesSearch(e: Evidence, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [e.title, e.body ?? "", ...e.tags].some((f) => f.toLowerCase().includes(s));
}

export function Sidebar(props: { evidence: Evidence[]; onPick: (e: Evidence) => void }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<EvidenceType | "all">("all");
  const list = useMemo(
    () => props.evidence.filter((e) => (type === "all" || e.type === type) && matchesSearch(e, q)),
    [props.evidence, q, type],
  );

  return (
    <aside className="sidebar">
      <div className="label" style={{ padding: "12px 12px 0" }}>
        Evidence · {props.evidence.length}
      </div>
      <div className="col" style={{ padding: 12, gap: 8 }}>
        <input
          className="hud-input"
          placeholder="Search title, text, tags"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="evidence-search"
        />
        <select className="hud-input" value={type} onChange={(e) => setType(e.target.value as EvidenceType | "all")}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All types" : t}
            </option>
          ))}
        </select>
      </div>
      <ul className="sidebar-list">
        {list.map((e) => (
          <li key={e.id}>
            <button data-testid="sidebar-item" onClick={() => props.onPick(e)}>
              <span className="card-icon">{TYPE_ICON[e.type]}</span>
              <span className="sidebar-title">{e.title}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="dim" style={{ padding: "0 12px" }}>Nothing matches.</li>}
      </ul>
    </aside>
  );
}
