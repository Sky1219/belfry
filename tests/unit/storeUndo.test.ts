import "fake-indexeddb/auto";
import { describe, expect, test } from "vitest";
import { EvidenceStore } from "../../src/store/store";

let n = 0;
const fresh = () => EvidenceStore.open(`test-undo-${++n}-${Date.now()}`);
const note = (caseId: string, title: string) => ({ caseId, type: "note" as const, title, provenance: { createdAt: 1 } });

describe("undoable deletes", () => {
  test("restoreEvidence brings back the evidence and exactly the links its delete removed", async () => {
    const s = await fresh();
    const c = await s.createCase("c");
    const a = await s.addEvidence(note(c.id, "a"));
    const b = await s.addEvidence(note(c.id, "b"));
    const x = await s.addEvidence(note(c.id, "x"));
    const ab = await s.addLink({ caseId: c.id, fromId: a.id, toId: b.id, kind: "user" });
    const bx = await s.addLink({ caseId: c.id, fromId: b.id, toId: x.id, kind: "user" });
    await s.deleteLink(bx.id); // deleted earlier, separately: must stay deleted

    const receipt = await s.deleteEvidence(a.id);
    expect(receipt).toEqual({ evidenceIds: [a.id], linkIds: [ab.id] });
    await s.restoreEvidence(receipt);

    expect((await s.listEvidence(c.id)).map((e) => e.title)).toEqual(["a", "b", "x"]);
    expect((await s.listLinks(c.id)).map((l) => l.id)).toEqual([ab.id]);
    const ops = (await s.changes()).slice(-2).map((e) => `${e.recordType}:${e.op}`);
    expect(ops).toEqual(["evidence:put", "link:put"]);
  });

  test("a deleted link can be restored on its own", async () => {
    const s = await fresh();
    const c = await s.createCase("c");
    const a = await s.addEvidence(note(c.id, "a"));
    const b = await s.addEvidence(note(c.id, "b"));
    const l = await s.addLink({ caseId: c.id, fromId: a.id, toId: b.id, kind: "user", label: "same ink" });
    await s.restoreEvidence(await s.deleteLink(l.id));
    expect(await s.listLinks(c.id)).toMatchObject([{ id: l.id, label: "same ink" }]);
  });

  test("restoreCase undoes deleteCase without reviving evidence deleted before it", async () => {
    const s = await fresh();
    const c = await s.createCase("c");
    const a = await s.addEvidence(note(c.id, "a"));
    const gone = await s.addEvidence(note(c.id, "gone"));
    await s.deleteEvidence(gone.id);

    const receipt = await s.deleteCase(c.id);
    expect(await s.listCases()).toEqual([]);
    await s.restoreCase(c.id, receipt);

    expect((await s.listCases()).map((x) => x.id)).toEqual([c.id]);
    expect((await s.listEvidence(c.id)).map((e) => e.id)).toEqual([a.id]);
  });
});

describe("numbering and summaries", () => {
  test("exhibit and case numbers follow creation order and never move", async () => {
    const s = await fresh();
    const c1 = await s.createCase("one");
    const c2 = await s.createCase("two");
    const a = await s.addEvidence(note(c2.id, "a"));
    const b = await s.addEvidence(note(c2.id, "b"));
    await s.deleteEvidence(a.id);
    const c = await s.addEvidence(note(c2.id, "c"));
    await s.deleteCase(c1.id);

    const nums = await s.exhibitNumbers(c2.id);
    expect([nums.get(b.id), nums.get(c.id)]).toEqual([2, 3]);
    expect(await s.caseNumber(c2.id)).toBe(2);
  });

  test("exhibits created in the same millisecond still number in creation order", async () => {
    const s = await fresh();
    const c = await s.createCase("burst");
    const now = Date.now;
    Date.now = () => 1_700_000_000_000; // freeze the clock: every id shares one timestamp
    try {
      const made = [];
      for (let i = 0; i < 40; i++) made.push(await s.addEvidence(note(c.id, `n${i}`)));
      const nums = await s.exhibitNumbers(c.id);
      expect(made.map((e) => nums.get(e.id))).toEqual(made.map((_, i) => i + 1));
    } finally {
      Date.now = now;
    }
  });

  test("caseSummaries counts live evidence and links per case", async () => {
    const s = await fresh();
    const c = await s.createCase("c");
    const a = await s.addEvidence(note(c.id, "a"));
    const b = await s.addEvidence(note(c.id, "b"));
    await s.addLink({ caseId: c.id, fromId: a.id, toId: b.id, kind: "user" });
    await s.deleteEvidence(b.id);
    expect(await s.caseSummaries()).toEqual(new Map([[c.id, expect.objectContaining({ number: 1, evidence: 1, links: 0 })]]));
  });
});
