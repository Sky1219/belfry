import { describe, expect, test } from "vitest";
import { BUILTIN_PRESETS, requiredModels, type ModelName } from "../../src/tools/detective/presets";

const sorted = (s: Set<ModelName>) => [...s].sort();
const preset = (id: string) => BUILTIN_PRESETS.find((p) => p.id === id)!;

describe("presets", () => {
  test("requiredModels for each built-in preset with depth enabled", () => {
    const req = (id: string) => sorted(requiredModels(preset(id).mode, new Set(preset(id).overlays), true));
    expect(req("investigate")).toEqual(["depth", "detection", "segmentation"]);
    expect(req("interrogation")).toEqual(["detection", "face", "pose"]);
    expect(req("stakeout")).toEqual(["detection", "segmentation"]);
    expect(req("heat")).toEqual(["depth", "detection", "face", "segmentation"]);
  });

  test("depth is never required when depth is disabled", () => {
    for (const p of BUILTIN_PRESETS) {
      expect(requiredModels(p.mode, new Set(p.overlays), false).has("depth")).toBe(false);
    }
    expect(requiredModels("thermal", new Set(["depthFog"]), false).has("depth")).toBe(false);
  });

  test("normal mode with no overlays needs only detection", () => {
    expect(sorted(requiredModels("normal", new Set(), true))).toEqual(["detection"]);
  });
});
