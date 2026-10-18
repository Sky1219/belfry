import { nextPosition } from "../../board/placement";
import { makeThumbnail, makeVideoThumbnail } from "../../store/blobs";
import type { Evidence } from "../../store/schema";
import type { EvidenceStore } from "../../store/store";
import { DETECTIVE_TOOL_ID } from "./presets";

/** Draws the WebGL view and the 2D overlay into one canvas (same size as the GL canvas). */
export function compositeFrame(glCanvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement, out: HTMLCanvasElement): void {
  if (out.width !== glCanvas.width || out.height !== glCanvas.height) {
    out.width = glCanvas.width;
    out.height = glCanvas.height;
  }
  const ctx = out.getContext("2d")!;
  ctx.drawImage(glCanvas, 0, 0);
  ctx.drawImage(overlayCanvas, 0, 0, out.width, out.height);
}

interface SaveDeps {
  store: EvidenceStore;
  caseId: string;
  nowMs: number;
}

const stamp = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Saves the current composited view as an image on the board. */
export async function snapshot(deps: SaveDeps, canvases: { gl: HTMLCanvasElement; overlay: HTMLCanvasElement }): Promise<Evidence> {
  const out = document.createElement("canvas");
  compositeFrame(canvases.gl, canvases.overlay, out);
  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("snapshot failed"))), "image/png"));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const [blobHash, thumbHash] = await Promise.all([
    deps.store.putBlob(bytes, "image/png"),
    makeThumbnail(blob).then((t) => deps.store.putBlob(t, "image/jpeg")),
  ]);
  const existing = (await deps.store.listEvidence(deps.caseId)).map((e) => e.position);
  return deps.store.addEvidence({
    caseId: deps.caseId,
    type: "image",
    title: `Snapshot ${stamp(deps.nowMs)}`,
    blobHash,
    thumbHash,
    provenance: { toolId: DETECTIVE_TOOL_ID, createdAt: deps.nowMs },
    position: nextPosition(existing),
  });
}

/** Saves a recorded clip as video evidence on the board. */
export async function saveClip(deps: SaveDeps, clip: Blob, durationS: number): Promise<Evidence> {
  const bytes = new Uint8Array(await clip.arrayBuffer());
  const blobHash = await deps.store.putBlob(bytes, clip.type || "video/webm");
  const thumbHash = await makeVideoThumbnail(clip)
    .then((t) => deps.store.putBlob(t, "image/jpeg"))
    .catch(() => undefined);
  const existing = (await deps.store.listEvidence(deps.caseId)).map((e) => e.position);
  return deps.store.addEvidence({
    caseId: deps.caseId,
    type: "video",
    title: `Clip ${stamp(deps.nowMs)} · ${Math.round(durationS)} s`,
    blobHash,
    thumbHash,
    provenance: { toolId: DETECTIVE_TOOL_ID, createdAt: deps.nowMs },
    position: nextPosition(existing),
  });
}

const MIME_PREFERENCE = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

export function pickClipMime(isSupported: (m: string) => boolean): string {
  return MIME_PREFERENCE.find(isSupported) ?? "video/webm";
}

export interface ClipRecorderOpts {
  maxMs?: number;
  mime?: string;
  createRecorder?: (stream: MediaStream, opts: { mimeType: string }) => MediaRecorder;
  /** Called with the finished clip when recording stops on its own at maxMs. */
  onAutoStop?: (clip: Promise<Blob>) => void;
}

/** Records a canvas as WebM, stopping automatically after `maxMs` (30 s by default). */
export class ClipRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private done: Promise<Blob> | null = null;
  private maxMs: number;
  private mime: string;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: ClipRecorderOpts = {},
  ) {
    this.maxMs = opts.maxMs ?? 30_000;
    this.mime =
      opts.mime ??
      pickClipMime((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
  }

  get recording(): boolean {
    return this.recorder?.state === "recording";
  }

  elapsedMs(): number {
    return this.recording ? Date.now() - this.startedAt : 0;
  }

  start(): void {
    if (this.recording) return;
    const stream = this.canvas.captureStream(30);
    const make = this.opts.createRecorder ?? ((s, o) => new MediaRecorder(s, o));
    this.chunks = [];
    this.done = null;
    this.recorder = make(stream, { mimeType: this.mime });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.start();
    this.startedAt = Date.now();
    this.timer = setTimeout(() => {
      const clip = this.stop();
      this.opts.onAutoStop?.(clip);
    }, this.maxMs);
  }

  stop(): Promise<Blob> {
    if (this.done) return this.done;
    if (this.timer) clearTimeout(this.timer);
    const rec = this.recorder;
    this.done = new Promise<Blob>((resolve) => {
      if (!rec || rec.state === "inactive") return resolve(new Blob(this.chunks, { type: this.mime }));
      rec.onstop = () => resolve(new Blob(this.chunks, { type: this.mime }));
      rec.stop();
    });
    return this.done;
  }
}
