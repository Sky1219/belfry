import { beforeEach, describe, expect, test } from "vitest";
import { clearTools, inputForEvidence, listTools, registerTool, toolsAccepting } from "../../src/tools/registry";
import type { ToolManifest } from "../../src/tools/types";
import { detectiveManifest } from "../../src/tools/detective/manifest";
import { fingerprintManifest } from "../../src/tools/fingerprint/manifest";
import { photoManifest } from "../../src/tools/photo/manifest";
import { shadowManifest } from "../../src/tools/shadow/manifest";
import { stegoManifest } from "../../src/tools/stego/manifest";

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

  test("each tool's phone key word is distinct and a word of its name, so label-in-name holds (Ruling P4-R11)", () => {
    const manifests = [detectiveManifest, photoManifest, fingerprintManifest, stegoManifest, shadowManifest];
    const words = manifests.map((m) => m.shortName ?? m.name.split(" ").pop()!);
    expect(new Set(words.map((w) => w.toLowerCase())).size).toBe(manifests.length);
    for (const m of manifests) {
      expect(m.shortName, m.id).toBeDefined();
      expect(m.name.split(" "), m.id).toContain(m.shortName);
    }
  });

  test("note and finding evidence map to no tools", () => {
    expect(inputForEvidence("note")).toBeNull();
    expect(inputForEvidence("finding")).toBeNull();
    expect(inputForEvidence("video")).toBe("video");
    expect(inputForEvidence("image")).toBe("image");
    expect(inputForEvidence("audio")).toBe("audio");
  });
});
