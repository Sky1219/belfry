export type SourceStatus = "ok" | "lost";

/**
 * Anything a camera tool can read frames from: the live webcam or a video
 * file. Tools never care which.
 */
export interface FrameSource {
  readonly element: HTMLVideoElement;
  readonly width: number;
  readonly height: number;
  readonly kind: "live" | "file";
  /** Increments once per newly decoded frame. */
  frameId(): number;
  status(): SourceStatus;
  onStatus(fn: (s: SourceStatus) => void): () => void;
  play?(): Promise<void>;
  pause?(): void;
  seek?(t: number): void;
  readonly duration?: number;
  paused?(): boolean;
  currentTime(): number;
  dispose(): void;
}

/**
 * Turns source timestamps that can jump backwards (seeking, looping) into a
 * strictly increasing clock. MediaPipe's VIDEO mode rejects non-increasing
 * timestamps, so every model call goes through one of these.
 */
export class MonotonicClock {
  private last = -Infinity;
  private offset = 0;

  next(sourceMs: number): number {
    let t = sourceMs + this.offset;
    if (t <= this.last) {
      this.offset += this.last + 1 - t;
      t = this.last + 1;
    }
    this.last = t;
    return t;
  }
}

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (h: number) => void;
};

/** Shared implementation over an HTMLVideoElement. */
export class VideoElementSource implements FrameSource {
  private frames = 0;
  private lastTime = -1;
  private rvfcHandle = 0;
  private statusValue: SourceStatus = "ok";
  private listeners = new Set<(s: SourceStatus) => void>();
  private disposed = false;

  constructor(
    readonly element: HTMLVideoElement,
    readonly kind: "live" | "file",
    private cleanup: () => void = () => {},
  ) {
    const v = element as VideoWithRVFC;
    if (v.requestVideoFrameCallback) {
      const tick = () => {
        this.frames++;
        if (!this.disposed) this.rvfcHandle = v.requestVideoFrameCallback!(tick);
      };
      this.rvfcHandle = v.requestVideoFrameCallback(tick);
    }
  }

  get width() {
    return this.element.videoWidth;
  }
  get height() {
    return this.element.videoHeight;
  }
  get duration() {
    return this.kind === "file" ? this.element.duration : undefined;
  }

  frameId(): number {
    const v = this.element as VideoWithRVFC;
    if (!v.requestVideoFrameCallback && this.element.currentTime !== this.lastTime) {
      this.lastTime = this.element.currentTime;
      this.frames++;
    }
    return this.frames;
  }

  currentTime(): number {
    return this.element.currentTime;
  }

  status(): SourceStatus {
    return this.statusValue;
  }

  setStatus(s: SourceStatus) {
    if (s === this.statusValue) return;
    this.statusValue = s;
    for (const fn of this.listeners) fn(s);
  }

  onStatus(fn: (s: SourceStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispose(): void {
    this.disposed = true;
    (this.element as VideoWithRVFC).cancelVideoFrameCallback?.(this.rvfcHandle);
    this.listeners.clear();
    this.cleanup();
  }
}
