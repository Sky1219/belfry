import { nextPosition, placeNear, wallGeometry } from "../../board/placement";
import { makeThumbnail } from "../../store/blobs";
import type { Evidence, FindingDetail } from "../../store/schema";
import type { EvidenceStore } from "../../store/store";

export interface PinDeps {
  store: EvidenceStore;
  caseId: string;
  toolId: string;
  /** Thumbnail maker; the browser's by default. Tests pass a stub. */
  thumbnail?: (b: Blob) => Promise<Uint8Array>;
}

/** An image a tool puts on the board: a map, a crop, the demo photo. */
export interface PinImage {
  bytes: Uint8Array;
  mime: string;
  title: string;
  meta?: Record<string, unknown>;
}

export interface PinRequest {
  source: Evidence;
  /** The evidence image behind the finding (a heat map, say); the finding links to it instead of the source. */
  image?: PinImage;
  finding: { title: string; body: string; detail?: FindingDetail; meta?: Record<string, unknown> };
}

/** Stores the image's bytes and a thumbnail of it; the thumbnail is best-effort. */
async function storeImage(deps: PinDeps, image: PinImage) {
  const blobHash = await deps.store.putBlob(image.bytes, image.mime);
  const thumb = await (deps.thumbnail ?? makeThumbnail)(new Blob([image.bytes as BlobPart], { type: image.mime })).catch(() => undefined);
  const thumbHash = thumb && (await deps.store.putBlob(thumb, "image/jpeg"));
  return { blobHash, thumbHash };
}

/**
 * Pins a test's result beside its source: an optional image (the map) and the
 * finding. The map links to the source and the finding to the map, so the wall
 * reads source → map → finding; with no map the finding links to the source.
 */
export async function pinResult(deps: PinDeps, req: PinRequest): Promise<{ image?: Evidence; finding: Evidence }> {
  const { store, caseId, toolId } = deps;
  const { source } = req;
  const { taken, segments } = await wallGeometry(store, caseId);
  const [first, second] = placeNear(taken, source.position, req.image ? 2 : 1, segments);
  const provenance = { toolId, sourceEvidenceId: source.id, createdAt: Date.now() };

  let image: Evidence | undefined;
  if (req.image) {
    image = await store.addEvidence({
      caseId,
      type: "image",
      title: req.image.title,
      ...(await storeImage(deps, req.image)),
      provenance,
      position: first,
      meta: req.image.meta ?? {},
    });
    await store.addLink({ caseId, fromId: image.id, toId: source.id, kind: "derived-from" });
  }
  const finding = await store.addEvidence({
    caseId,
    type: "finding",
    title: req.finding.title,
    body: req.finding.body,
    provenance,
    position: image ? second : first,
    meta: { ...req.finding.meta, ...(req.finding.detail ? { finding: req.finding.detail } : {}) },
  });
  await store.addLink({ caseId, fromId: finding.id, toId: (image ?? source).id, kind: "derived-from" });
  return { image, finding };
}

/**
 * Pins a tool's demo input to the board, tagged `demo`, so the tool opens on a
 * real exhibit and its results link back to something the case holds.
 */
export async function pinDemoInput(deps: PinDeps, demo: PinImage): Promise<Evidence> {
  const { store, caseId, toolId } = deps;
  const { taken, segments } = await wallGeometry(store, caseId);
  return store.addEvidence({
    caseId,
    type: "image",
    title: demo.title,
    ...(await storeImage(deps, demo)),
    tags: ["demo"],
    provenance: { toolId, createdAt: Date.now() },
    position: nextPosition(taken, undefined, segments),
    meta: { ...demo.meta, staged: true },
  });
}
