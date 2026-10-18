import type { DepthMap, ModelAdapter } from "./types";

const INPUT_W = 256;

/**
 * Monocular depth (Depth Anything V2 Small via Transformers.js) in a Web Worker.
 * WebGPU + fp16 when available, otherwise WASM + q8.
 */
export function depthAdapter(): ModelAdapter<DepthMap | null> {
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<number, { resolve: (d: DepthMap | null) => void; reject: (e: Error) => void }>();

  return {
    name: "depth",
    load() {
      return new Promise<void>((resolve, reject) => {
        worker = new Worker(new URL("./depth.worker.ts", import.meta.url), { type: "module" });
        const webgpu = typeof navigator !== "undefined" && "gpu" in navigator;
        worker.onmessage = (e: MessageEvent) => {
          const m = e.data;
          if (m.type === "ready") resolve();
          else if (m.type === "error" && m.id === undefined) reject(new Error(m.message));
          else if (m.type === "error") {
            pending.get(m.id)?.reject(new Error(m.message));
            pending.delete(m.id);
          } else if (m.type === "result") {
            pending.get(m.id)?.resolve(m.data ? { data: m.data, width: m.width, height: m.height } : null);
            pending.delete(m.id);
          }
        };
        worker.onerror = (e) => reject(new Error(e.message || "depth worker failed"));
        worker.postMessage({ type: "load", device: webgpu ? "webgpu" : "wasm", dtype: webgpu ? "fp16" : "q8" });
      });
    },
    async infer(video) {
      if (!worker || !video.videoWidth) return null;
      const h = Math.max(1, Math.round((INPUT_W * video.videoHeight) / video.videoWidth));
      const bitmap = await createImageBitmap(video, { resizeWidth: INPUT_W, resizeHeight: h, resizeQuality: "low" });
      const id = nextId++;
      return new Promise<DepthMap | null>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker!.postMessage({ type: "infer", id, bitmap }, [bitmap]);
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      for (const p of pending.values()) p.resolve(null);
      pending.clear();
    },
  };
}
