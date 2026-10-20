import type { ModelName } from "../presets";

export type Box = [number, number, number, number];

/** Person confidence per pixel, row 0 = top of the image. */
export interface Mask {
  data: Float32Array;
  width: number;
  height: number;
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** 33 BlazePose landmarks, normalized image coordinates. */
export type PoseResult = { landmarks: Landmark[] } | null;

export interface Detection {
  label: string;
  score: number;
  /** Normalized x0, y0, x1, y1. */
  box: Box;
}

/** 478 Face Landmarker points (incl. iris 468–477) and their bounding box. */
export type FaceResult = { landmarks: Landmark[]; box: Box } | null;

/** Relative depth, bright = near, row 0 = top. */
export interface DepthMap {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface ModelOutputs {
  segmentation: Mask | null;
  pose: PoseResult;
  detection: Detection[];
  face: FaceResult;
  depth: DepthMap | null;
}

export interface ModelAdapter<T> {
  name: ModelName;
  load(): Promise<void>;
  infer(source: HTMLVideoElement, tMs: number): T | Promise<T>;
  dispose(): void;
}
