import { PoseLandmarker } from "@mediapipe/tasks-vision";
import { MonotonicClock } from "../../../platform/media/frameSource";
import { createFileset, createWithFallback, MODEL_URLS } from "./mediapipe";
import type { ModelAdapter, PoseResult } from "./types";

/** Body pose (MediaPipe Pose Landmarker lite, one person). */
export function poseAdapter(): ModelAdapter<PoseResult> {
  let pose: PoseLandmarker | null = null;
  const clock = new MonotonicClock();
  return {
    name: "pose",
    async load() {
      const fs = await createFileset();
      pose = await createWithFallback((delegate) =>
        PoseLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: MODEL_URLS.pose, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
        }),
      );
    },
    infer(video, tMs) {
      if (!pose) return null;
      const r = pose.detectForVideo(video, clock.next(tMs));
      const lm = r.landmarks[0];
      return lm ? { landmarks: lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })) } : null;
    },
    dispose() {
      pose?.close();
      pose = null;
    },
  };
}
