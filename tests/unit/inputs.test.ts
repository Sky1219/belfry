import { describe, expect, test } from "vitest";
import type { Evidence, EvidenceType } from "../../src/store/schema";
import { defaultInput, fileAcceptFor, parseToolInput, pickableEvidence, readEvidenceBlob } from "../../src/tools/inputs";

const ev = (id: string, type: EvidenceType, patch: Partial<Evidence> = {}): Evidence => ({
  id,
  caseId: "c",
  type,
  title: id,
  tags: [],
  provenance: { createdAt: 0 },
  position: { x: 0, y: 0 },
  meta: {},
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
  ...patch,
});

const storeWith = (...items: Evidence[]) => ({ getEvidence: async (id: string) => items.find((e) => e.id === id) });

describe("tool inputs", () => {
  test("parses every route input, including the old demo-feed name", async () => {
    const s = storeWith(ev("v1", "video"));
    expect(await parseToolInput(s, "live-camera")).toEqual({ kind: "ready", input: { kind: "live-camera" } });
    expect(await parseToolInput(s, "demo")).toEqual({ kind: "ready", input: { kind: "demo" } });
    expect(await parseToolInput(s, "demo-feed")).toEqual({ kind: "ready", input: { kind: "demo" } });
    expect(await parseToolInput(s, "pick")).toEqual({ kind: "pick" });
    const r = await parseToolInput(s, "ev:v1");
    expect(r.kind === "ready" && r.input.kind === "evidence" && r.input.evidence.id).toBe("v1");
  });

  test("missing or deleted evidence and unknown inputs are errors in plain words", async () => {
    const s = storeWith(ev("gone", "image", { deleted: true }));
    expect(await parseToolInput(s, "ev:nope")).toEqual({ kind: "error", message: "That evidence no longer exists." });
    expect(await parseToolInput(s, "ev:gone")).toEqual({ kind: "error", message: "That evidence no longer exists." });
    expect(await parseToolInput(s, "webcam")).toEqual({ kind: "error", message: "Unrecognized tool input." });
  });

  test("a camera tool opens on the camera; any other on the picker", () => {
    expect(defaultInput({ accepts: ["live-camera", "video"] })).toBe("live-camera");
    expect(defaultInput({ accepts: ["image"] })).toBe("pick");
  });

  test("file accept strings follow the evidence a tool takes", () => {
    expect(fileAcceptFor(["live-camera", "video"])).toBe("video/*");
    expect(fileAcceptFor(["image", "audio"])).toBe("image/*,audio/*");
    expect(fileAcceptFor(["live-camera"])).toBe("");
  });

  test("pickable evidence is the case's live evidence of the accepted types", () => {
    const all = [ev("i", "image"), ev("v", "video"), ev("a", "audio"), ev("n", "note"), ev("f", "finding"), ev("d", "image", { deleted: true })];
    expect(pickableEvidence(all, ["image", "audio"]).map((e) => e.id)).toEqual(["i", "a"]);
    expect(pickableEvidence(all, ["live-camera"])).toEqual([]);
  });

  test("reads the evidence's file, or says it's missing", async () => {
    const store = {
      getBlob: async (h: string) => (h === "h1" ? { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" } : undefined),
    };
    const blob = await readEvidenceBlob(store, ev("i", "image", { blobHash: "h1" }));
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(3);
    await expect(readEvidenceBlob(store, ev("x", "image", { title: "Receipt", blobHash: "h2" }))).rejects.toThrow("The file for “Receipt” is missing.");
  });
});
