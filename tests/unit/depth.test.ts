import { describe, expect, test, vi } from "vitest";
import { depthAdapter } from "../../src/tools/detective/models/depth";

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminate = vi.fn();
  posted: unknown[] = [];
  constructor(private behaviour: "ready" | "fail") {}
  postMessage(msg: { type: string }) {
    this.posted.push(msg);
    if (msg.type === "load") {
      queueMicrotask(() =>
        this.onmessage?.({ data: this.behaviour === "ready" ? { type: "ready" } : { type: "error", message: "CDN blocked" } } as MessageEvent),
      );
    }
  }
}

const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;

describe("depth adapter", () => {
  test("retrying a failed load terminates the previous worker", async () => {
    const workers: FakeWorker[] = [];
    const behaviours: Array<"fail" | "ready"> = ["fail", "ready"];
    const a = depthAdapter(() => {
      const w = new FakeWorker(behaviours[workers.length]);
      workers.push(w);
      return w as unknown as Worker;
    });
    await expect(a.load()).rejects.toThrow(/CDN blocked/);
    await a.load();
    expect(workers).toHaveLength(2);
    expect(workers[0].terminate).toHaveBeenCalled();
    expect(workers[1].terminate).not.toHaveBeenCalled();
  });

  test("a worker crash after ready fails pending requests instead of hanging", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ close() {} }));
    let w!: FakeWorker;
    const a = depthAdapter(() => (w = new FakeWorker("ready")) as unknown as Worker);
    await a.load();
    const pending = a.infer(video, 0) as Promise<unknown>;
    await Promise.resolve();
    await Promise.resolve();
    w.onerror?.({ message: "out of memory" } as ErrorEvent);
    await expect(pending).rejects.toThrow(/out of memory/);
    vi.unstubAllGlobals();
  });
});
