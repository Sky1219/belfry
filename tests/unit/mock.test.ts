import { describe, expect, test } from "vitest";
import { createMockAdapters, MOCK_PULSE_BPM } from "../../src/tools/detective/models/mock";
import type { Detection, FaceResult } from "../../src/tools/detective/models/types";

const video = {} as HTMLVideoElement;
const at = async <T,>(name: string, tMs: number): Promise<T> => {
  const a = createMockAdapters()[name as "face"];
  await a.load();
  return (await a.infer(video, tMs)) as T;
};

const contains = (b: [number, number, number, number], x: number, y: number) => b[0] <= x && x <= b[2] && b[1] <= y && y <= b[3];

describe("mock models", () => {
  test("cup is under center between 2 s and 8 s", async () => {
    for (const t of [2200, 5000, 7800]) {
      const dets = await at<Detection[]>("detection", t);
      const cup = dets.find((d) => d.label === "cup")!;
      expect(contains(cup.box, 0.5, 0.5), `t=${t}`).toBe(true);
    }
    for (const t of [500, 9500]) {
      const cup = (await at<Detection[]>("detection", t)).find((d) => d.label === "cup")!;
      expect(contains(cup.box, 0.5, 0.5), `t=${t}`).toBe(false);
    }
  });

  test("mock outputs are deterministic for the same t", async () => {
    for (const name of ["segmentation", "pose", "detection", "face", "depth"]) {
      expect(await at(name, 4321)).toEqual(await at(name, 4321));
    }
  });

  test("mock face blinks every 3 s", async () => {
    const lidGap = (f: FaceResult) => Math.abs(f!.landmarks[160].y - f!.landmarks[144].y);
    const open = await at<FaceResult>("face", 1000);
    const closed = await at<FaceResult>("face", 2900);
    const closedAgain = await at<FaceResult>("face", 5900);
    expect(lidGap(closed)).toBeLessThan(lidGap(open) * 0.3);
    expect(lidGap(closedAgain)).toBeLessThan(lidGap(open) * 0.3);
    expect(open!.landmarks).toHaveLength(478);
    expect(MOCK_PULSE_BPM).toBe(72);
  });
});
