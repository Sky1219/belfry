import { makeThumbnail, makeVideoThumbnail } from "../store/blobs";
import type { Evidence, EvidenceType } from "../store/schema";
import type { EvidenceStore } from "../store/store";
import { nextPosition, wallGeometry, type Pt } from "./placement";

/** What the board's file picker offers; drops are filtered the same way. */
export const EVIDENCE_FILE_ACCEPT = "image/*,video/*,audio/*";

/** Large enough for a phone clip, small enough that IndexedDB stays healthy. */
export const MAX_EVIDENCE_BYTES = 500 * 1024 ** 2;

export function evidenceTypeFor(file: { type: string }): Extract<EvidenceType, "image" | "video" | "audio"> | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

/** "harbour-cam_0412.mp4" → "harbour-cam 0412" */
export function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  return base || "Untitled file";
}

export interface AddFilesResult {
  added: Evidence[];
  /** Files left out, each with the reason in plain words. */
  skipped: Array<{ name: string; reason: string }>;
}

/**
 * Pins media files to a case as image / video / audio evidence, with
 * thumbnails, placed in free slots near `near`.
 */
export async function addEvidenceFiles(store: EvidenceStore, caseId: string, files: File[], near?: Pt): Promise<AddFilesResult> {
  const result: AddFilesResult = { added: [], skipped: [] };
  const { taken, segments } = await wallGeometry(store, caseId);
  for (const file of files) {
    const type = evidenceTypeFor(file);
    if (!type) {
      result.skipped.push({ name: file.name, reason: "not an image, video or audio file" });
      continue;
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      result.skipped.push({ name: file.name, reason: "larger than 500 MB" });
      continue;
    }
    const thumb =
      type === "audio" ? undefined : await (type === "image" ? makeThumbnail(file) : makeVideoThumbnail(file)).catch(() => undefined);
    if (type === "video" && !thumb && !canDecode(file)) {
      result.skipped.push({ name: file.name, reason: "this browser can't play that video format" });
      continue;
    }
    const blobHash = await store.putBlob(new Uint8Array(await file.arrayBuffer()), file.type);
    const thumbHash = thumb && (await store.putBlob(thumb, "image/jpeg"));
    const position = nextPosition(taken, near, segments);
    taken.push(position);
    result.added.push(
      await store.addEvidence({
        caseId,
        type,
        title: titleFromFilename(file.name),
        blobHash,
        thumbHash,
        provenance: { createdAt: Date.now() },
        position,
        meta: { filename: file.name, bytes: file.size },
      }),
    );
  }
  return result;
}

const canDecode = (file: File) => document.createElement("video").canPlayType(file.type) !== "";
