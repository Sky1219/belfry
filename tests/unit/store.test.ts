import "fake-indexeddb/auto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { EvidenceStore } from "../../src/store/store";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
let n = 0;
const fresh = () => EvidenceStore.open(`test-store-${++n}-${Date.now()}`);

afterEach(() => vi.unstubAllGlobals());

describe("EvidenceStore", () => {
  test("creates a case and lists it", async () => {
    const s = await fresh();
    const c = await s.createCase("The Mug Affair");
    expect(c.id).toMatch(ULID);
    expect(c.status).toBe("open");
    expect(c.deleted).toBe(false);
    expect((await s.listCases()).map((x) => x.title)).toEqual(["The Mug Affair"]);
  });

  test("adds evidence with defaults", async () => {
    const s = await fresh();
    const c = await s.createCase("c");
    const e = await s.addEvidence({ caseId: c.id, type: "note", title: "First note", provenance: { createdAt: 1 } });
    expect(e.id).toMatch(ULID);
    expect(e.tags).toEqual([]);
    expect(e.meta).toEqual({});
    expect(e.position).toEqual({ x: 0, y: 0 });
    expect(await s.listEvidence(c.id)).toHaveLength(1);
  });

  test("deleteEvidence soft-deletes it and its links", async () => {
    const s = await fresh();
    const c = await s.createCase("c");
    const a = await s.addEvidence({ caseId: c.id, type: "note", title: "a", provenance: { createdAt: 1 } });
    const b = await s.addEvidence({ caseId: c.id, type: "note", title: "b", provenance: { createdAt: 1 } });
    const l = await s.addLink({ caseId: c.id, fromId: a.id, toId: b.id, kind: "user" });
    await s.deleteEvidence(a.id);
    expect((await s.listEvidence(c.id)).map((e) => e.id)).toEqual([b.id]);
    expect(await s.listLinks(c.id)).toEqual([]);
    expect((await s.db.evidence.get(a.id))?.deleted).toBe(true);
    expect((await s.db.links.get(l.id))?.deleted).toBe(true);
  });

  test("every write appends a change entry in order", async () => {
    const s = await fresh();
    const c = await s.createCase("c");
    const e = await s.addEvidence({ caseId: c.id, type: "note", title: "x", provenance: { createdAt: 1 } });
    await s.deleteEvidence(e.id);
    const ch = await s.changes();
    expect(ch.map((x) => [x.recordType, x.op])).toEqual([
      ["case", "put"],
      ["evidence", "put"],
      ["evidence", "delete"],
    ]);
    expect(ch[0].seq).toBeLessThan(ch[1].seq);
    expect(ch[1].seq).toBeLessThan(ch[2].seq);
    expect((await s.changes(ch[1].seq)).map((x) => x.op)).toEqual(["delete"]);
  });

  test("subscribe fires on writes to that case only, and unsubscribe stops it", async () => {
    const s = await fresh();
    const c1 = await s.createCase("one");
    const c2 = await s.createCase("two");
    const fn = vi.fn();
    const off = s.subscribe(c1.id, fn);
    await s.addEvidence({ caseId: c2.id, type: "note", title: "other", provenance: { createdAt: 1 } });
    expect(fn).not.toHaveBeenCalled();
    await s.addEvidence({ caseId: c1.id, type: "note", title: "mine", provenance: { createdAt: 1 } });
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    await s.addEvidence({ caseId: c1.id, type: "note", title: "after", provenance: { createdAt: 1 } });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("falls back to memory when indexedDB is undefined", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const s = await EvidenceStore.open("no-idb");
    expect(s.persistent).toBe(false);
    const c = await s.createCase("ephemeral");
    expect((await s.listCases()).map((x) => x.id)).toEqual([c.id]);
  });
});
