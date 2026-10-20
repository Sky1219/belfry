import { afterEach, describe, expect, test, vi } from "vitest";
import { ClipRecorder, pickClipMime } from "../../src/tools/detective/capture";

afterEach(() => vi.useRealTimers());

class FakeRecorder {
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(
    public stream: unknown,
    public opts: { mimeType: string },
  ) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["frames"], { type: this.opts.mimeType }) });
    this.onstop?.();
  }
}

describe("capture", () => {
  test("pickClipMime prefers vp9 then vp8 then webm", () => {
    expect(pickClipMime(() => true)).toBe("video/webm;codecs=vp9");
    expect(pickClipMime((m) => m !== "video/webm;codecs=vp9")).toBe("video/webm;codecs=vp8");
    expect(pickClipMime((m) => m === "video/webm")).toBe("video/webm");
  });

  test("ClipRecorder auto-stops at maxMs", async () => {
    vi.useFakeTimers();
    const canvas = { captureStream: () => ({ getTracks: () => [] }) } as unknown as HTMLCanvasElement;
    const onAutoStop = vi.fn();
    const rec = new ClipRecorder(canvas, {
      maxMs: 30_000,
      mime: "video/webm",
      createRecorder: (s, o) => new FakeRecorder(s, o) as unknown as MediaRecorder,
      onAutoStop,
    });
    rec.start();
    expect(rec.recording).toBe(true);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(rec.recording).toBe(true);
    expect(rec.elapsedMs()).toBeGreaterThanOrEqual(29_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(rec.recording).toBe(false);
    expect(onAutoStop).toHaveBeenCalledTimes(1);
    const blob: Blob = await onAutoStop.mock.calls[0][0];
    expect(blob.type).toBe("video/webm");
    expect(await rec.stop()).toBe(blob); // stopping again returns the same clip
  });
});
