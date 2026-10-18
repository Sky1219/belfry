import type { Evidence, Link, Position } from "../store/schema";
import { exhibitTag, TYPE_LABEL, type CardMenuItem, type CardNode } from "./EvidenceCard";

export interface NodeExtras {
  /** Exhibit numbers by evidence id. */
  exhibits?: Map<string, number>;
  /** Links, to show each derived exhibit's source number. */
  links?: Link[];
  /** Evidence created after this time plays the pin-drop on arrival. */
  arrivingAfter?: number;
  /** Positions moved locally but not yet saved; they win over the stored ones. */
  pendingPositions?: Map<string, Position>;
}

/** Exhibit number of the evidence each piece was derived from. */
function sourceExhibits(extras: NodeExtras): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of extras.links ?? []) {
    if (l.kind !== "derived-from") continue;
    const n = extras.exhibits?.get(l.toId);
    if (n) out.set(l.fromId, n);
  }
  return out;
}

/**
 * Builds React Flow nodes from evidence while keeping each existing node's
 * internal state (measured size, selection, dragging). Rebuilding nodes from
 * scratch would make React Flow hide every card until it re-measures, so cards
 * would blink whenever any evidence changed.
 */
export function mergeNodes(
  prev: CardNode[],
  evidence: Evidence[],
  menuFor: (e: Evidence) => CardMenuItem[],
  extras: NodeExtras = {},
): CardNode[] {
  const byId = new Map(prev.map((n) => [n.id, n]));
  const sources = sourceExhibits(extras);
  return evidence.map((e) => {
    const old = byId.get(e.id);
    const exhibit = extras.exhibits?.get(e.id);
    const data = {
      evidence: e,
      menu: menuFor(e),
      exhibit,
      sourceExhibit: sources.get(e.id),
      arriving: old?.data.arriving ?? (extras.arrivingAfter !== undefined && e.createdAt > extras.arrivingAfter),
    };
    const ariaLabel = `${exhibitTag(exhibit).replace("·", " ")}, ${TYPE_LABEL[e.type].toLowerCase()}: ${e.title}`;
    const stored = extras.pendingPositions?.get(e.id) ?? e.position;
    if (old) return { ...old, position: old.dragging ? old.position : stored, data, ariaLabel };
    return { id: e.id, type: "evidence" as const, position: stored, data, ariaLabel };
  });
}
