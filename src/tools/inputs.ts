import type { Evidence } from "../store/schema";
import type { EvidenceStore } from "../store/store";
import { inputForEvidence } from "./registry";
import type { EvidenceInput, ToolInput, ToolManifest } from "./types";

/** A tool's route input, resolved: a ready input, the No Signal picker, or why it can't open. */
export type ResolvedInput = { kind: "ready"; input: ToolInput } | { kind: "pick" } | { kind: "error"; message: string };

/**
 * Route input → tool input. "demo-feed" is the old name of "demo" and still
 * parses, so links and bookmarks from before keep working.
 */
export async function parseToolInput(store: Pick<EvidenceStore, "getEvidence">, raw: string): Promise<ResolvedInput> {
  if (raw === "live-camera") return { kind: "ready", input: { kind: "live-camera" } };
  if (raw === "demo" || raw === "demo-feed") return { kind: "ready", input: { kind: "demo" } };
  if (raw === "pick") return { kind: "pick" };
  if (raw.startsWith("ev:")) {
    const ev = await store.getEvidence(raw.slice(3));
    if (!ev || ev.deleted) return { kind: "error", message: "That evidence no longer exists." };
    return { kind: "ready", input: { kind: "evidence", evidence: ev } };
  }
  return { kind: "error", message: "Unrecognized tool input." };
}

/** Where a tool opens from the rack: the camera if it takes one, otherwise the picker. */
export const defaultInput = (m: Pick<ToolManifest, "accepts">) => (m.accepts.includes("live-camera") ? "live-camera" : "pick");

const MIME: Record<Exclude<EvidenceInput, "live-camera">, string> = { image: "image/*", video: "video/*", audio: "audio/*" };

/** The file picker's `accept` for a tool: "image/*,video/*". Empty when it takes no files. */
export function fileAcceptFor(accepts: EvidenceInput[]): string {
  return accepts
    .filter((a): a is Exclude<EvidenceInput, "live-camera"> => a !== "live-camera")
    .map((a) => MIME[a])
    .join(",");
}

/** The case's evidence a tool can be pointed at, in board order. */
export function pickableEvidence(evidence: Evidence[], accepts: EvidenceInput[]): Evidence[] {
  return evidence.filter((e) => {
    const input = inputForEvidence(e.type);
    return !e.deleted && input !== null && accepts.includes(input);
  });
}

/** The evidence's file as a Blob, or a plain-words error when it's gone. */
export async function readEvidenceBlob(store: Pick<EvidenceStore, "getBlob">, ev: Evidence): Promise<Blob> {
  const rec = ev.blobHash ? await store.getBlob(ev.blobHash) : undefined;
  if (!rec) throw new Error(`The file for “${ev.title}” is missing.`);
  return new Blob([rec.bytes as BlobPart], { type: rec.mime });
}
