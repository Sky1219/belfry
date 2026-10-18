import type { Evidence } from "../store/schema";
import type { CardMenuItem, CardNode } from "./EvidenceCard";

/**
 * Builds React Flow nodes from evidence while keeping each existing node's
 * internal state (measured size, selection, dragging). Rebuilding nodes from
 * scratch would make React Flow hide every card until it re-measures, so cards
 * would blink whenever any evidence changed.
 */
export function mergeNodes(prev: CardNode[], evidence: Evidence[], menuFor: (e: Evidence) => CardMenuItem[]): CardNode[] {
  const byId = new Map(prev.map((n) => [n.id, n]));
  return evidence.map((e) => {
    const old = byId.get(e.id);
    const data = { evidence: e, menu: menuFor(e) };
    if (old) return { ...old, position: old.dragging ? old.position : e.position, data };
    return { id: e.id, type: "evidence" as const, position: e.position, data };
  });
}
