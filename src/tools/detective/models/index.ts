import type { ModelName } from "../presets";
import { depthAdapter } from "./depth";
import { detectorAdapter } from "./detector";
import { faceAdapter } from "./face";
import { poseAdapter } from "./pose";
import { segmenterAdapter } from "./segmenter";
import type { ModelAdapter } from "./types";

/** The real (downloaded) models. Use createMockAdapters() for `?mock`. */
export function createRealAdapters(): Record<ModelName, ModelAdapter<unknown>> {
  return {
    segmentation: segmenterAdapter(),
    pose: poseAdapter(),
    detection: detectorAdapter(),
    face: faceAdapter(),
    depth: depthAdapter(),
  };
}
