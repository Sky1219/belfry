import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { MonotonicClock } from "../../../platform/media/frameSource";
import { createFileset, createWithFallback, MODEL_URLS } from "./mediapipe";
import { TaskHolder } from "./taskHolder";
import type { FaceResult, ModelAdapter } from "./types";

/** Face mesh incl. iris (MediaPipe Face Landmarker, one face). */
export function faceAdapter(): ModelAdapter<FaceResult> {
  const holder = new TaskHolder<FaceLandmarker>();
  const clock = new MonotonicClock();
  return {
    name: "face",
    async load() {
      const fs = await createFileset();
      await holder.load(() =>
        createWithFallback((delegate) =>
        FaceLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: MODEL_URLS.face, delegate },
          runningMode: "VIDEO",
          numFaces: 1,
        }),
      ),
      );
    },
    infer(video, tMs) {
      const face = holder.get();
      if (!face) return null;
      const r = face.detectForVideo(video, clock.next(tMs));
      const lm = r.faceLandmarks[0];
      if (!lm) return null;
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      for (const p of lm) {
        if (p.x < x0) x0 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.x > x1) x1 = p.x;
        if (p.y > y1) y1 = p.y;
      }
      return { landmarks: lm.map((p) => ({ x: p.x, y: p.y, z: p.z })), box: [x0, y0, x1, y1] };
    },
    dispose() {
      holder.dispose();
    },
  };
}
