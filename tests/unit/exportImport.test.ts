import "fake-indexeddb/auto";
import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { EvidenceStore } from "../../src/store/store";
import { exportCase, importCase, ImportError, peekImport } from "../../src/store/exportImport";

let n = 0;
const fresh = () => EvidenceStore.open(`test-io-${++n}-${Date.now()}`);

/** A case with a note, an image (with blob), a finding derived from the image, and two links. */
async function seed(s: EvidenceStore) {
  const c = await s.createCase("Harbor Case");
  const hash = await s.putBlob(new Uint8Array([1, 2, 3, 4, 5]), "image/jpeg");
  const img = await s.addEvidence({
    caseId: c.id, type: "image", title: "Crop", blobHash: hash, provenance: { toolId: "detective-vision", createdAt: 1 },
    position: { x: 10, y: 20 }, tags: ["mug"],
  });
  const finding = await s.addEvidence({
    caseId: c.id, type: "finding", title: "Note", body: "Ceramic mug.", provenance: { toolId: "detective-vision", sourceEvidenceId: img.id, createdAt: 2 },
  });
  const note = await s.addEvidence({ caseId: c.id, type: "note", title: "Hunch", provenance: { createdAt: 3 } });
  await s.addLink({ caseId: c.id, fromId: finding.id, toId: img.id, kind: "derived-from" });
  await s.addLink({ caseId: c.id, fromId: note.id, toId: img.id, kind: "user", label: "same object" });
  const gone = await s.addEvidence({ caseId: c.id, type: "note", title: "deleted", provenance: { createdAt: 4 } });
  await s.deleteEvidence(gone.id);
  return { c, hash, img, finding, note };
}

const strip = <T extends object>(xs: T[]) => xs.map((x) => ({ ...x, updatedAt: 0 }));

async function counts(s: EvidenceStore) {
  return [await s.db.cases.count(), await s.db.evidence.count(), await s.db.links.count(), await s.db.blobs.count()];
}

describe("blobs", () => {
  test("putBlob dedupes identical bytes", async () => {
    const s = await fresh();
    const a = await s.putBlob(new Uint8Array([9, 9, 9]), "image/png");
    const b = await s.putBlob(new Uint8Array([9, 9, 9]), "image/png");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await s.db.blobs.count()).toBe(1);
    expect(Array.from((await s.getBlob(a))!.bytes)).toEqual([9, 9, 9]);
  });
});

describe(".belfry export/import", () => {
  test("export → import(replace) into an empty DB yields identical case, evidence, links, and blob bytes", async () => {
    const a = await fresh();
    const { c, hash } = await seed(a);
    const file = await exportCase(a, c.id);

    const b = await fresh();
    expect(await peekImport(b, file)).toEqual({ caseId: c.id, exists: false });
    const imported = await importCase(b, file, "replace");
    expect(imported.id).toBe(c.id);
    expect({ ...(await b.getCase(c.id)), updatedAt: 0 }).toEqual({ ...(await a.getCase(c.id)), updatedAt: 0 });
    expect(strip(await b.listEvidence(c.id))).toEqual(strip(await a.listEvidence(c.id)));
    expect(await b.listLinks(c.id)).toEqual(await a.listLinks(c.id));
    expect(Array.from((await b.getBlob(hash))!.bytes)).toEqual([1, 2, 3, 4, 5]);
    // soft-deleted evidence is not exported
    expect((await b.db.evidence.toArray()).some((e) => e.title === "deleted")).toBe(false);
  });

  test("import as copy assigns new ids and remaps links and provenance", async () => {
    const s = await fresh();
    const { c } = await seed(s);
    const file = await exportCase(s, c.id);
    expect((await peekImport(s, file)).exists).toBe(true);

    const copy1 = await importCase(s, file, "copy");
    const copy2 = await importCase(s, file, "copy");
    expect(await s.listCases()).toHaveLength(3);
    expect(new Set([c.id, copy1.id, copy2.id]).size).toBe(3);

    for (const cp of [copy1, copy2]) {
      const ev = await s.listEvidence(cp.id);
      const ids = new Set(ev.map((e) => e.id));
      expect(ev).toHaveLength(3);
      for (const l of await s.listLinks(cp.id)) {
        expect(ids.has(l.fromId)).toBe(true);
        expect(ids.has(l.toId)).toBe(true);
      }
      for (const e of ev) {
        if (e.provenance.sourceEvidenceId) expect(ids.has(e.provenance.sourceEvidenceId)).toBe(true);
      }
    }

    const victim = (await s.listEvidence(copy1.id)).find((e) => e.type === "image")!;
    await s.deleteEvidence(victim.id);
    expect(await s.listEvidence(copy2.id)).toHaveLength(3);
    expect(await s.listLinks(copy2.id)).toHaveLength(2);
    expect(await s.listEvidence(c.id)).toHaveLength(3);
  });

  test("import as copy remaps the fingerprint pairing and prints in meta, dropping ids not in the file", async () => {
    const s = await fresh();
    const c = await s.createCase("Prints Case");
    const other = await s.createCase("Other Case");
    const outside = await s.addEvidence({ caseId: other.id, type: "image", title: "Elsewhere", provenance: { createdAt: 1 } });
    const b = await s.addEvidence({ caseId: c.id, type: "image", title: "Print B", provenance: { createdAt: 1 } });
    const a = await s.addEvidence({
      caseId: c.id, type: "image", title: "Print A", provenance: { createdAt: 2 }, meta: { pairWith: b.id },
    });
    const f = await s.addEvidence({
      caseId: c.id, type: "finding", title: "Fingerprint match", provenance: { createdAt: 3 },
      meta: { prints: [a.id, b.id, outside.id] },
    });
    const lonely = await s.addEvidence({
      caseId: c.id, type: "image", title: "Lonely", provenance: { createdAt: 4 }, meta: { pairWith: outside.id },
    });
    void f;
    void lonely;
    const copy = await importCase(s, await exportCase(s, c.id), "copy");
    const ev = await s.listEvidence(copy.id);
    const byTitle = (t: string) => ev.find((e) => e.title === t)!;
    expect(byTitle("Print A").meta.pairWith).toBe(byTitle("Print B").id);
    expect(byTitle("Fingerprint match").meta.prints).toEqual([byTitle("Print A").id, byTitle("Print B").id]);
    expect("pairWith" in byTitle("Lonely").meta).toBe(false);
  });

  test("rejects wrong formatVersion with reason bad-version and writes nothing", async () => {
    const a = await fresh();
    const { c } = await seed(a);
    const files = unzipSync(await exportCase(a, c.id));
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    files["manifest.json"] = strToU8(JSON.stringify({ ...manifest, formatVersion: 99 }));
    const b = await fresh();
    const before = await counts(b);
    await expect(importCase(b, zipSync(files), "replace")).rejects.toMatchObject({ reason: "bad-version" });
    expect(await counts(b)).toEqual(before);
  });

  test("rejects a zip missing a referenced blob with reason missing-blob and writes nothing", async () => {
    const a = await fresh();
    const { c, hash } = await seed(a);
    const files = unzipSync(await exportCase(a, c.id));
    delete files[`blobs/${hash}`];
    const b = await fresh();
    await expect(importCase(b, zipSync(files), "replace")).rejects.toMatchObject({ reason: "missing-blob" });
    expect(await counts(b)).toEqual([0, 0, 0, 0]);
  });

  test("rejects malformed records with reason bad-structure and writes nothing", async () => {
    const a = await fresh();
    const { c } = await seed(a);
    const files = unzipSync(await exportCase(a, c.id));
    const records = JSON.parse(new TextDecoder().decode(files["records.json"]));
    const breakages: Array<(r: typeof records) => void> = [
      (r) => delete r.evidence[0].tags,
      (r) => delete r.evidence[0].provenance,
      (r) => (r.evidence[0].position = { x: "left" }),
      (r) => (r.evidence[0].type = "hologram"),
      (r) => (r.evidence[0].title = 42),
      (r) => (r.links[0].kind = "telepathy"),
    ];
    for (const breakIt of breakages) {
      const copy = structuredClone(records);
      breakIt(copy);
      const b = await fresh();
      const bad = zipSync({ ...files, "records.json": strToU8(JSON.stringify(copy)) });
      await expect(importCase(b, bad, "replace")).rejects.toMatchObject({ reason: "bad-structure" });
      expect(await counts(b)).toEqual([0, 0, 0, 0]);
    }
  });

  test("rejects random bytes with reason not-zip", async () => {
    const b = await fresh();
    const err = await importCase(b, new Uint8Array([7, 7, 7, 7, 7, 7]), "replace").catch((e) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err.reason).toBe("not-zip");
  });
});
