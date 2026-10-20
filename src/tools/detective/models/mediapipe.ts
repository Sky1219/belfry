import { FilesetResolver } from "@mediapipe/tasks-vision";

export const MODEL_URLS = {
  segmentation:
    "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
  pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  detection:
    "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite",
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
} as const;

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
let filesetPromise: Promise<Fileset> | null = null;

/** MediaPipe's WASM runtime, served from our own origin (copied there on install). */
export function createFileset(): Promise<Fileset> {
  if (!filesetPromise) {
    const base = new URL("mediapipe/wasm", document.baseURI).href;
    filesetPromise = FilesetResolver.forVisionTasks(base).catch((e) => {
      filesetPromise = null; // allow a retry
      throw e;
    });
  }
  return filesetPromise;
}

/** Creates a MediaPipe task on the GPU, falling back to the CPU if the GPU delegate fails. */
export async function createWithFallback<T>(make: (delegate: "GPU" | "CPU") => Promise<T>): Promise<T> {
  try {
    return await make("GPU");
  } catch (e) {
    console.warn("[models] GPU delegate failed, using CPU:", e);
    return make("CPU");
  }
}
