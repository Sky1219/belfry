import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

// Keep the WASM version in lockstep with the npm package version.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

export interface Mask {
  data: Float32Array;
  width: number;
  height: number;
}

/** Person segmentation (MediaPipe selfie segmenter, GPU delegate). */
export class PersonSegmenter {
  private constructor(private seg: ImageSegmenter) {}

  static async create(): Promise<PersonSegmenter> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const seg = await ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
    return new PersonSegmenter(seg);
  }

  segment(video: HTMLVideoElement, timestampMs: number): Mask | null {
    const result = this.seg.segmentForVideo(video, timestampMs);
    const m = result.confidenceMasks?.[0];
    if (!m) {
      result.close();
      return null;
    }
    // Copy out before close() frees the underlying buffer.
    const mask = { data: m.getAsFloat32Array().slice(), width: m.width, height: m.height };
    result.close();
    return mask;
  }
}
