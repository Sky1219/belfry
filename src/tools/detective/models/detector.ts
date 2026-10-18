import { ObjectDetector } from "@mediapipe/tasks-vision";
import { MonotonicClock } from "../../../platform/media/frameSource";
import { createFileset, createWithFallback, MODEL_URLS } from "./mediapipe";
import type { Detection, ModelAdapter } from "./types";

/** Object detection (EfficientDet-Lite0, COCO classes). Boxes are normalized to the frame. */
export function detectorAdapter(): ModelAdapter<Detection[]> {
  let det: ObjectDetector | null = null;
  const clock = new MonotonicClock();
  return {
    name: "detection",
    async load() {
      const fs = await createFileset();
      det = await createWithFallback((delegate) =>
        ObjectDetector.createFromOptions(fs, {
          baseOptions: { modelAssetPath: MODEL_URLS.detection, delegate },
          runningMode: "VIDEO",
          scoreThreshold: 0.35,
          maxResults: 12,
        }),
      );
    },
    infer(video, tMs) {
      if (!det) return [];
      const W = video.videoWidth || 1;
      const H = video.videoHeight || 1;
      const r = det.detectForVideo(video, clock.next(tMs));
      const out: Detection[] = [];
      for (const d of r.detections) {
        const c = d.categories[0];
        const b = d.boundingBox;
        if (!c || !b) continue;
        out.push({
          label: c.categoryName,
          score: c.score,
          box: [b.originX / W, b.originY / H, (b.originX + b.width) / W, (b.originY + b.height) / H],
        });
      }
      return out;
    },
    dispose() {
      det?.close();
      det = null;
    },
  };
}
