import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { useBlobUrl } from "../app/storeContext";
import type { Evidence } from "../store/schema";

export const TYPE_ICON: Record<Evidence["type"], string> = {
  image: "▣",
  video: "▶",
  audio: "∿",
  note: "✎",
  finding: "◆",
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
};

export type CardNode = Node<CardData, "evidence">;

function EvidenceCardImpl({ data, selected }: NodeProps<CardNode>) {
  const e = data.evidence;
  const thumb = useBlobUrl(e.thumbHash ?? (e.type === "image" ? e.blobHash : undefined));
  const [menuOpen, setMenuOpen] = useState(false);
  const local = e.meta?.source === "local";

  return (
    <div className={`evidence-card type-${e.type} ${selected ? "selected" : ""}`} data-testid="evidence-card" data-type={e.type}>
      <Handle type="target" position={Position.Left} />
      <div className="card-head">
        <span className="card-icon" title={e.type}>
          {TYPE_ICON[e.type]}
        </span>
        <span className="card-title">{e.title}</span>
        <button
          className="card-menu-btn nodrag"
          aria-label="Evidence menu"
          data-testid="card-menu"
          onClick={(ev) => {
            ev.stopPropagation();
            setMenuOpen((o) => !o);
          }}
        >
          ⋯
        </button>
      </div>
      {thumb && <img className="card-thumb" src={thumb} alt="" draggable={false} />}
      {e.type === "video" && !thumb && <div className="card-thumb placeholder">VIDEO</div>}
      {e.body && <p className="card-body">{e.body}</p>}
      <div className="card-foot">
        {e.provenance.toolId && <span className="card-src">{local ? "LOCAL · " : ""}{e.provenance.toolId}</span>}
        {e.tags.map((t) => (
          <span key={t} className="card-tag">
            #{t}
          </span>
        ))}
      </div>
      {menuOpen && (
        <div className="card-menu nodrag" onMouseLeave={() => setMenuOpen(false)}>
          {data.menu.map((m) => (
            <button
              key={m.label}
              className={m.danger ? "danger" : ""}
              data-testid={m.testId}
              onClick={(ev) => {
                ev.stopPropagation();
                setMenuOpen(false);
                m.onSelect();
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const EvidenceCard = memo(EvidenceCardImpl);
