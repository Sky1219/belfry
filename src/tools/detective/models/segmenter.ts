import { ImageSegmenter } from "@mediapipe/tasks-vision";
import { MonotonicClock } from "../../../platform/media/frameSource";
import { createFileset, createWithFallback, MODEL_URLS } from "./mediapipe";
import { TaskHolder } from "./taskHolder";
import { personMaskIndex } from "./maskIndex";
import type { Mask, ModelAdapter } from "./types";

/** Person segmentation (MediaPipe selfie segmenter, confidence mask). */
export function segmenterAdapter(): ModelAdapter<Mask | null> {
  const holder = new TaskHolder<ImageSegmenter>();
  const clock = new MonotonicClock();
  return {
    name: "segmentation",
    async load() {
      const fs = await createFileset();
      await holder.load(() =>
        createWithFallback((delegate) =>
        ImageSegmenter.createFromOptions(fs, {
          baseOptions: { modelAssetPath: MODEL_URLS.segmentation, delegate },
          runningMode: "VIDEO",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        }),
      ),
      );
    },
    infer(video, tMs) {
      const seg = holder.get();
      if (!seg) return null;
      const r = seg.segmentForVideo(video, clock.next(tMs));
      try {
        const masks = r.confidenceMasks ?? [];
        const m = masks[personMaskIndex(seg.getLabels?.() ?? [], masks.length)];
        return m ? { data: m.getAsFloat32Array().slice(), width: m.width, height: m.height } : null;
      } finally {
        r.close();
      }
    },
    dispose() {
      holder.dispose();
    },
  };
}
