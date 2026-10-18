/// <reference lib="webworker" />
import { env, pipeline, RawImage } from "@huggingface/transformers";

/**
 * Runs Depth Anything V2 Small off the main thread so depth never stalls the video.
 * Messages in:  { type: "load", device, dtype } | { type: "infer", id, bitmap }
 * Messages out: { type: "ready" } | { type: "error", message } | { type: "result", id, data, width, height }
 */
env.allowLocalModels = false;

type DepthPipe = (img: RawImage) => Promise<{ depth: RawImage }>;
let estimator: DepthPipe | null = null;
const scratch = new OffscreenCanvas(1, 1);
const sctx = scratch.getContext("2d", { willReadFrequently: true })!;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      estimator = (await pipeline("depth-estimation", "onnx-community/depth-anything-v2-small", {
        device: msg.device,
        dtype: msg.dtype,
      })) as unknown as DepthPipe;
      self.postMessage({ type: "ready" });
    } else if (msg.type === "infer") {
      const bmp = msg.bitmap as ImageBitmap;
      if (!estimator) {
        bmp.close();
        self.postMessage({ type: "result", id: msg.id, data: null, width: 0, height: 0 });
        return;
      }
      scratch.width = bmp.width;
      scratch.height = bmp.height;
      sctx.drawImage(bmp, 0, 0);
      bmp.close();
      const px = sctx.getImageData(0, 0, scratch.width, scratch.height);
      const img = new RawImage(px.data, px.width, px.height, 4);
      const { depth } = await estimator(img);
      const data = new Uint8Array(depth.data as Uint8Array);
      (self as unknown as Worker).postMessage({ type: "result", id: msg.id, data, width: depth.width, height: depth.height }, [data.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: "error", id: msg.id, message: (err as Error).message });
  }
};
