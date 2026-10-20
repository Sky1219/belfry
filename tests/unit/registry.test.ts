import { beforeEach, describe, expect, test } from "vitest";
import { clearTools, inputForEvidence, listTools, registerTool, toolsAccepting } from "../../src/tools/registry";
import type { ToolManifest } from "../../src/tools/types";

const tool = (id: string, accepts: ToolManifest["accepts"]): ToolManifest => ({
  id,
  name: id,
  accepts,
  demo: { label: "Run the demo" },
  load: async () => () => null,
});

beforeEach(() => clearTools());

describe("tool registry", () => {
  test("toolsAccepting filters by input", () => {
    registerTool(tool("vision", ["live-camera", "video"]));
    registerTool(tool("forensics", ["image"]));
    registerTool(tool("audio", ["audio"]));
    expect(listTools().map((t) => t.id)).toEqual(["vision", "forensics", "audio"]);
    expect(toolsAccepting("video").map((t) => t.id)).toEqual(["vision"]);
    expect(toolsAccepting("image").map((t) => t.id)).toEqual(["forensics"]);
    expect(toolsAccepting("live-camera").map((t) => t.id)).toEqual(["vision"]);
  });

  test("note and finding evidence map to no tools", () => {
    expect(inputForEvidence("note")).toBeNull();
    expect(inputForEvidence("finding")).toBeNull();
    expect(inputForEvidence("video")).toBe("video");
    expect(inputForEvidence("image")).toBe("image");
    expect(inputForEvidence("audio")).toBe("audio");
  });
});
