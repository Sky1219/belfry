import type { DepthMap, ModelAdapter } from "./types";

const INPUT_W = 256;

const defaultWorker = () => new Worker(new URL("./depth.worker.ts", import.meta.url), { type: "module" });

/**
 * Monocular depth (Depth Anything V2 Small via Transformers.js) in a Web Worker.
 * WebGPU + fp16 when available, otherwise WASM + q8.
 */
export function depthAdapter(makeWorker: () => Worker = defaultWorker): ModelAdapter<DepthMap | null> {
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<number, { resolve: (d: DepthMap | null) => void; reject: (e: Error) => void }>();

  const failAll = (err: Error) => {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  const stop = () => {
    worker?.terminate();
    worker = null;
  };

  return {
    name: "depth",
    load() {
      stop(); // a retry must not leave the previous worker (and its model) alive
      return new Promise<void>((resolve, reject) => {
        const w = makeWorker();
        worker = w;
        let ready = false;
        const webgpu = typeof navigator !== "undefined" && "gpu" in navigator;
        w.onmessage = (e: MessageEvent) => {
          const m = e.data;
          if (m.type === "ready") {
            ready = true;
            resolve();
          } else if (m.type === "error" && m.id === undefined) {
            if (worker === w) stop();
            reject(new Error(m.message));
          } else if (m.type === "error") {
            pending.get(m.id)?.reject(new Error(m.message));
            pending.delete(m.id);
          } else if (m.type === "result") {
            pending.get(m.id)?.resolve(m.data ? { data: m.data, width: m.width, height: m.height } : null);
            pending.delete(m.id);
          }
        };
        w.onerror = (e) => {
          const err = new Error(e.message || "depth worker failed");
          failAll(err);
          if (!ready) reject(err);
          if (worker === w) stop();
        };
        w.postMessage({ type: "load", device: webgpu ? "webgpu" : "wasm", dtype: webgpu ? "fp16" : "q8" });
      });
    },
    async infer(video) {
      if (!worker || !video.videoWidth) return null;
      const h = Math.max(1, Math.round((INPUT_W * video.videoHeight) / video.videoWidth));
      const bitmap = await createImageBitmap(video, { resizeWidth: INPUT_W, resizeHeight: h, resizeQuality: "low" });
      if (!worker) {
        bitmap.close();
        return null;
      }
      const id = nextId++;
      const w = worker;
      return new Promise<DepthMap | null>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        w.postMessage({ type: "infer", id, bitmap }, [bitmap]);
      });
    },
    dispose() {
      stop();
      for (const p of pending.values()) p.resolve(null);
      pending.clear();
    },
  };
}
