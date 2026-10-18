import type { EvidenceType } from "../store/schema";
import type { EvidenceInput, ToolManifest } from "./types";

const tools: ToolManifest[] = [];

export function registerTool(m: ToolManifest): void {
  if (tools.some((t) => t.id === m.id)) return;
  tools.push(m);
}

export function listTools(): ToolManifest[] {
  return [...tools];
}

export function getTool(id: string): ToolManifest | undefined {
  return tools.find((t) => t.id === id);
}

/** For tests. */
export function clearTools(): void {
  tools.length = 0;
}

export function toolsAccepting(input: EvidenceInput): ToolManifest[] {
  return tools.filter((t) => t.accepts.includes(input));
}

/** Which tool input a piece of evidence provides; notes and findings provide none. */
export function inputForEvidence(type: EvidenceType): EvidenceInput | null {
  switch (type) {
    case "image":
    case "video":
    case "audio":
      return type;
    default:
      return null;
  }
}

/** Route encoding of a tool input: "live-camera", "demo-feed" or "ev:<evidenceId>". */
export const encodeInput = (input: { kind: "live-camera" } | { kind: "demo-feed" } | { kind: "evidence"; id: string }) =>
  input.kind === "evidence" ? `ev:${input.id}` : input.kind;
