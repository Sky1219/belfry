import { nextPosition, placeNear, wallGeometry } from "../../../board/placement";
import { LlmError, type LlmClient, type LlmErrorKind } from "../../../platform/llm";
import type { Evidence } from "../../../store/schema";
import type { EvidenceStore } from "../../../store/store";
import type { Box } from "../models/types";
import { DETECTIVE_TOOL_ID } from "../presets";
import { localNote } from "./localNote";
import { centerRegion } from "./scan";
import type { Track } from "./tracker";

export const FORENSIC_SYSTEM_PROMPT = [
  "You are a terse forensic examiner cataloguing evidence from a single photo crop.",
  "Reply with one or two plain sentences, 30 words at most.",
  "Describe only the object and its visible condition: material, color, wear, damage, residue, markings, contents.",
  "Never identify, describe, or speculate about any person, even if one is partly visible.",
  "If the image is unclear, say what can and cannot be determined. No preamble, no formatting.",
].join(" ");

export interface ScanCapture {
  jpeg: Uint8Array;
  track: Track | null;
  color: string;
  tVisibleS: number;
  anchor?: { x: number; y: number };
}

export interface ScanResult {
  image: Evidence;
  finding: Evidence;
  source: "llm" | "local";
  reason?: LlmErrorKind;
}

const MAX_WORDS = 30;

export function truncateWords(text: string, max = MAX_WORDS): string {
  const words = text.trim().split(/\s+/);
  return words.length <= max ? text.trim() : `${words.slice(0, max).join(" ")}…`;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

/**
 * Turns a scan into evidence: stores the crop as an image, writes a forensic
 * note (Claude when a key is set, otherwise a local note), and links the note
 * to the image. An API failure never loses a scan — it falls back to a local
 * note marked LOCAL ANALYSIS with the reason.
 */
export async function recordScan(
  deps: { store: EvidenceStore; llm: LlmClient; caseId: string; nowMs: number },
  scan: ScanCapture,
): Promise<ScanResult> {
  const { store, llm, caseId } = deps;
  const t = scan.track;
  // Board titles carry the object, not the on-screen tracker tag (EV-nn), so they never compete with EXH numbers.
  const subject = t ? t.label.charAt(0).toUpperCase() + t.label.slice(1) : "Center scan";
  const box: Box = t?.box ?? centerRegion();
  const fallback = localNote({ label: t?.label ?? null, score: t?.score ?? null, color: scan.color, box, tVisibleS: scan.tVisibleS });

  let body = fallback;
  let source: "llm" | "local" = "local";
  let reason: LlmErrorKind | undefined;
  if (llm.available()) {
    try {
      const prompt = t
        ? `Object detector label: ${t.label} (${Math.round(t.score * 100)}% confidence). Describe this object as evidence.`
        : "Describe the main object in this crop as evidence.";
      body = truncateWords(await llm.describeImage({ jpegBase64: toBase64(scan.jpeg), system: FORENSIC_SYSTEM_PROMPT, prompt }));
      source = "llm";
    } catch (e) {
      reason = e instanceof LlmError ? e.kind : "network";
    }
  }

  const { taken: existing, segments } = await wallGeometry(store, caseId);
  const imgPos = nextPosition(existing, scan.anchor, segments);
  // the finding sits beside the crop it came from
  const [notePos] = placeNear([...existing, imgPos], imgPos, 1, segments);

  const blobHash = await store.putBlob(scan.jpeg, "image/jpeg");
  const now = deps.nowMs;
  const image = await store.addEvidence({
    caseId,
    type: "image",
    title: `${subject} — crop`,
    blobHash,
    tags: t ? [t.label.replace(/\s+/g, "-")] : [],
    provenance: { toolId: DETECTIVE_TOOL_ID, createdAt: now },
    position: imgPos,
    meta: t ? { label: t.label, score: t.score, box: t.box, track: t.tag } : { box },
  });
  const finding = await store.addEvidence({
    caseId,
    type: "finding",
    title: `${reason ? "LOCAL ANALYSIS — " : ""}${subject} — note`,
    body,
    provenance: { toolId: DETECTIVE_TOOL_ID, sourceEvidenceId: image.id, createdAt: now },
    position: notePos,
    meta: { source, ...(reason ? { reason } : {}) },
  });
  await store.addLink({ caseId, fromId: finding.id, toId: image.id, kind: "derived-from" });
  return { image, finding, source, ...(reason ? { reason } : {}) };
}
