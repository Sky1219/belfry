import "fake-indexeddb/auto";
import { describe, expect, test } from "vitest";
import { pinDemoInput, pinResult, type PinDeps } from "../../src/tools/imagekit/pin";
import { EvidenceStore } from "../../src/store/store";
import type { FindingDetail } from "../../src/store/schema";

let n = 0;
const TOOL = "photo-forensics";

async function setup() {
  const store = await EvidenceStore.open(`test-pin-${++n}-${Date.now()}`);
  const c = await store.createCase("c");
  const source = await store.addEvidence({ caseId: c.id, type: "image", title: "photo", provenance: { createdAt: 1 } });
  const deps: PinDeps = { store, caseId: c.id, toolId: TOOL, thumbnail: async () => new Uint8Array([1]) };
  return { store, caseId: c.id, source, deps };
}

describe("pinResult", () => {
  test("pins a map and a finding beside the source, linked map→source and finding→map", async () => {
    const { store, caseId, source, deps } = await setup();
    const detail: FindingDetail = { kind: "measurement", value: 87, unit: "blocks", uncertainty: 2 };
    const { image, finding } = await pinResult(deps, {
      source,
      image: { bytes: new Uint8Array([9, 9]), mime: "image/png", title: "Copy-move map", meta: { test: "copy-move" } },
      finding: { title: "Copy-move: consistent with duplicated regions", body: "87 blocks", detail },
    });
    expect(image).toBeDefined();
    for (const e of [image!, finding]) {
      expect(e.provenance.toolId).toBe(TOOL);
      expect(e.provenance.sourceEvidenceId).toBe(source.id);
    }
    expect(image!.type).toBe("image");
    expect(image!.thumbHash).toBeDefined();
    expect(image!.meta).toEqual({ test: "copy-move" });
    expect(finding.type).toBe("finding");
    expect(finding.meta.finding).toEqual(detail);
    const links = (await store.listLinks(caseId)).map((l) => ({ from: l.fromId, to: l.toId, kind: l.kind }));
    expect(links).toEqual([
      { from: image!.id, to: source.id, kind: "derived-from" },
      { from: finding.id, to: image!.id, kind: "derived-from" },
    ]);
    const spots = new Set([source, image!, finding].map((e) => `${e.position.x},${e.position.y}`));
    expect(spots.size).toBe(3);
  });

  test("without a map the finding links to the source", async () => {
    const { store, caseId, source, deps } = await setup();
    const { image, finding } = await pinResult(deps, { source, finding: { title: "Metadata: inconclusive", body: "none" } });
    expect(image).toBeUndefined();
    expect(finding.provenance.sourceEvidenceId).toBe(source.id);
    expect(finding.meta.finding).toBeUndefined();
    expect((await store.listLinks(caseId)).map((l) => ({ from: l.fromId, to: l.toId, kind: l.kind }))).toEqual([
      { from: finding.id, to: source.id, kind: "derived-from" },
    ]);
    expect(finding.position).not.toEqual(source.position);
  });
});

describe("pinDemoInput", () => {
  test("a demo input is tagged demo and has the tool's provenance", async () => {
    const { store, caseId, deps } = await setup();
    const demo = await pinDemoInput(deps, { bytes: new Uint8Array([1, 2, 3]), mime: "image/png", title: "Demo photo" });
    expect(demo.tags).toEqual(["demo"]);
    expect(demo.provenance.toolId).toBe(TOOL);
    expect(demo.meta.staged).toBe(true);
    expect(demo.type).toBe("image");
    expect(demo.blobHash).toBeDefined();
    expect(demo.thumbHash).toBeDefined();
    expect((await store.listEvidence(caseId)).map((e) => e.id)).toContain(demo.id);
  });
});
