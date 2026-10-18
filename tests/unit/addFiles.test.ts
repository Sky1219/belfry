import { describe, expect, test } from "vitest";
import { evidenceTypeFor, titleFromFilename } from "../../src/board/addFiles";
import { provenanceLabel } from "../../src/board/EvidenceCard";
import type { Evidence } from "../../src/store/schema";

describe("adding files as evidence", () => {
  test("maps media types to evidence types and rejects the rest", () => {
    expect(evidenceTypeFor({ type: "image/png" })).toBe("image");
    expect(evidenceTypeFor({ type: "video/mp4" })).toBe("video");
    expect(evidenceTypeFor({ type: "audio/mpeg" })).toBe("audio");
    expect(evidenceTypeFor({ type: "application/pdf" })).toBeNull();
    expect(evidenceTypeFor({ type: "" })).toBeNull();
  });

  test("titles come from the filename without its extension", () => {
    expect(titleFromFilename("harbour-cam_0412.mp4")).toBe("harbour-cam 0412");
    expect(titleFromFilename("IMG_2201.JPG")).toBe("IMG 2201");
    expect(titleFromFilename(".mp4")).toBe("Untitled file");
  });
});

describe("card provenance", () => {
  const ev = (patch: Partial<Evidence>): Evidence => ({
    id: "e",
    caseId: "c",
    type: "finding",
    title: "t",
    tags: [],
    provenance: { createdAt: 0 },
    position: { x: 0, y: 0 },
    meta: {},
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    ...patch,
  });

  test("names the tool, local fallback and source exhibit", () => {
    expect(provenanceLabel(ev({ provenance: { createdAt: 0, toolId: "detective-vision" }, meta: { source: "local" } }), 3)).toBe(
      "Detective Vision · Local analysis · from EXH·003",
    );
    expect(provenanceLabel(ev({ type: "note" }))).toBe("Pinned by hand");
    expect(provenanceLabel(ev({ type: "image", meta: { filename: "a.png" } }))).toBe("Imported file");
    expect(provenanceLabel(ev({ tags: ["demo"] }))).toBe("Staged");
  });
});
