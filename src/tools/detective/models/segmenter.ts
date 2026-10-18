import { ImageSegmenter } from "@mediapipe/tasks-vision";
import { MonotonicClock } from "../../../platform/media/frameSource";
import { createFileset, createWithFallback, MODEL_URLS } from "./mediapipe";
import type { Mask, ModelAdapter } from "./types";

/** Person segmentation (MediaPipe selfie segmenter, confidence mask). */
export function segmenterAdapter(): ModelAdapter<Mask | null> {
  let seg: ImageSegmenter | null = null;
  const clock = new MonotonicClock();
  return {
    name: "segmentation",
    async load() {
      const fs = await createFileset();
      seg = await createWithFallback((delegate) =>
        ImageSegmenter.createFromOptions(fs, {
          baseOptions: { modelAssetPath: MODEL_URLS.segmentation, delegate },
          runningMode: "VIDEO",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        }),
      );
    },
    infer(video, tMs) {
      if (!seg) return null;
      const r = seg.segmentForVideo(video, clock.next(tMs));
      try {
        const m = r.confidenceMasks?.[0];
        return m ? { data: m.getAsFloat32Array().slice(), width: m.width, height: m.height } : null;
      } finally {
        r.close();
      }
    },
    dispose() {
      seg?.close();
      seg = null;
    },
  };
}
