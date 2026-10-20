import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from "fflate";
import { monotonicFactory } from "ulid";

/** Ids sort in creation order even within one millisecond (exhibit and case numbers depend on it). */
const ulid = monotonicFactory();
import type { BlobRecord, Case, Evidence, Link } from "./schema";
import type { EvidenceStore } from "./store";
import { sha256Hex } from "./blobs";

export const FORMAT_VERSION = 1;

export type ImportReason = "not-zip" | "bad-version" | "bad-structure" | "missing-blob";

export class ImportError extends Error {
  constructor(
    readonly reason: ImportReason,
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

interface Manifest {
  formatVersion: number;
  case: Case;
  exportedAt: number;
}

interface Records {
  evidence: Evidence[];
  links: Link[];
  blobs: Array<{ hash: string; mime: string }>;
}

/** Packs one case (records + referenced media) into a `.belfry` zip. */
export async function exportCase(store: EvidenceStore, caseId: string): Promise<Uint8Array> {
  const c = await store.getCase(caseId);
  if (!c) throw new Error(`case ${caseId} not found`);
  const evidence = await store.listEvidence(caseId);
  const links = await store.listLinks(caseId);
  const hashes = new Set<string>();
  for (const e of evidence) {
    if (e.blobHash) hashes.add(e.blobHash);
    if (e.thumbHash) hashes.add(e.thumbHash);
  }
  const files: Record<string, Uint8Array> = {};
  const blobs: Records["blobs"] = [];
  for (const hash of hashes) {
    const b = await store.getBlob(hash);
    if (!b) continue;
    files[`blobs/${hash}`] = b.bytes;
    blobs.push({ hash, mime: b.mime });
  }
  const manifest: Manifest = { formatVersion: FORMAT_VERSION, case: c, exportedAt: Date.now() };
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  files["records.json"] = strToU8(JSON.stringify({ evidence, links, blobs } satisfies Records));
  // Media is already compressed; store blobs uncompressed, compress JSON.
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([k, v]) => [k, [v, { level: k.startsWith("blobs/") ? 0 : 6 }] as const]),
    ),
  );
}

/** Reads the case id from a `.belfry` file without importing it. */
export async function peekImport(store: EvidenceStore, bytes: Uint8Array): Promise<{ caseId: string; exists: boolean }> {
  const { manifest } = parse(bytes);
  return { caseId: manifest.case.id, exists: !!(await store.getCase(manifest.case.id)) };
}

/**
 * Imports a `.belfry` file. The archive is fully validated before anything is
 * written, and all writes happen in one transaction.
 * - "replace": records keep their ids; an existing case with that id is overwritten.
 * - "copy": every record gets a new id; links and provenance are remapped.
 */
export async function importCase(store: EvidenceStore, bytes: Uint8Array, mode: "replace" | "copy"): Promise<Case> {
  const { manifest, records, files } = parse(bytes);
  const blobRows: BlobRecord[] = [];
  for (const b of records.blobs) {
    const data = files[`blobs/${b.hash}`];
    if (!data) throw new ImportError("missing-blob", `Missing media file ${b.hash.slice(0, 12)}…`);
    if ((await sha256Hex(data)) !== b.hash) throw new ImportError("bad-structure", "A media file is corrupted.");
    blobRows.push({ hash: b.hash, mime: b.mime, size: data.byteLength, bytes: data });
  }
  const known = new Set(blobRows.map((b) => b.hash));
  for (const e of records.evidence) {
    for (const h of [e.blobHash, e.thumbHash]) {
      if (h && !known.has(h)) throw new ImportError("missing-blob", `Evidence "${e.title}" references missing media.`);
    }
  }

  let c = manifest.case;
  let evidence = records.evidence;
  let links = records.links;
  if (mode === "copy") ({ c, evidence, links } = remap(c, evidence, links));

  const db = store.db;
  await db.transaction("rw", [db.cases, db.evidence, db.links, db.blobs, db.changes], async () => {
    if (mode === "replace") {
      const keepE = new Set(evidence.map((e) => e.id));
      const keepL = new Set(links.map((l) => l.id));
      for (const e of await db.evidence.where("caseId").equals(c.id).toArray()) {
        if (!keepE.has(e.id) && !e.deleted) {
          await db.evidence.put({ ...e, deleted: true });
          await store.log("evidence", e.id, "delete");
        }
      }
      for (const l of await db.links.where("caseId").equals(c.id).toArray()) {
        if (!keepL.has(l.id) && !l.deleted) {
          await db.links.put({ ...l, deleted: true });
          await store.log("link", l.id, "delete");
        }
      }
    }
    for (const b of blobRows) {
      if (await db.blobs.get(b.hash)) continue;
      await db.blobs.put(b);
      await store.log("blob", b.hash, "put");
    }
    await db.cases.put({ ...c, deleted: false });
    await store.log("case", c.id, "put");
    for (const e of evidence) {
      await db.evidence.put({ ...e, deleted: false });
      await store.log("evidence", e.id, "put");
    }
    for (const l of links) {
      await db.links.put({ ...l, deleted: false });
      await store.log("link", l.id, "put");
    }
  });
  store.emit(c.id);
  return { ...c, deleted: false };
}

function parse(bytes: Uint8Array): { manifest: Manifest; records: Records; files: Unzipped } {
  let files: Unzipped;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ImportError("not-zip", "This isn't a Belfry case file.");
  }
  const json = (name: string): unknown => {
    const f = files[name];
    if (!f) throw new ImportError("bad-structure", `The file is missing ${name}.`);
    try {
      return JSON.parse(strFromU8(f));
    } catch {
      throw new ImportError("bad-structure", `${name} is not valid JSON.`);
    }
  };
  const manifest = json("manifest.json") as Manifest;
  if (manifest?.formatVersion !== FORMAT_VERSION) {
    throw new ImportError(
      "bad-version",
      `This case file uses format version ${manifest?.formatVersion ?? "?"}; this Belfry reads version ${FORMAT_VERSION}.`,
    );
  }
  const records = json("records.json") as Records;
  const ok =
    isCase(manifest.case) &&
    Array.isArray(records?.evidence) &&
    Array.isArray(records?.links) &&
    Array.isArray(records?.blobs) &&
    records.evidence.every((e) => isEvidence(e) && e.caseId === manifest.case.id) &&
    records.links.every((l) => isLink(l) && l.caseId === manifest.case.id) &&
    records.blobs.every((b) => typeof b?.hash === "string" && typeof b?.mime === "string");
  if (!ok) throw new ImportError("bad-structure", "The case file's records are malformed.");
  const ids = new Set(records.evidence.map((e) => e.id));
  if (!records.links.every((l) => ids.has(l.fromId) && ids.has(l.toId))) {
    throw new ImportError("bad-structure", "A link points at evidence that isn't in the file.");
  }
  return { manifest, records, files };
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const EVIDENCE_TYPES = new Set(["image", "video", "audio", "note", "finding"]);

function isCase(c: unknown): c is Case {
  const x = c as Case;
  return !!x && isStr(x.id) && isStr(x.title) && (x.status === "open" || x.status === "closed") && isNum(x.createdAt);
}

/** Every field the board reads must be present and well-typed, or the card would crash on render. */
function isEvidence(e: unknown): e is Evidence {
  const x = e as Evidence;
  return (
    !!x &&
    isStr(x.id) &&
    isStr(x.caseId) &&
    EVIDENCE_TYPES.has(x.type) &&
    isStr(x.title) &&
    (x.body === undefined || isStr(x.body)) &&
    Array.isArray(x.tags) &&
    x.tags.every(isStr) &&
    (x.blobHash === undefined || isStr(x.blobHash)) &&
    (x.thumbHash === undefined || isStr(x.thumbHash)) &&
    !!x.provenance &&
    isNum(x.provenance.createdAt) &&
    !!x.position &&
    isNum(x.position.x) &&
    isNum(x.position.y) &&
    !!x.meta &&
    typeof x.meta === "object" &&
    isNum(x.createdAt) &&
    isNum(x.updatedAt)
  );
}

function isLink(l: unknown): l is Link {
  const x = l as Link;
  return (
    !!x &&
    isStr(x.id) &&
    isStr(x.caseId) &&
    isStr(x.fromId) &&
    isStr(x.toId) &&
    (x.kind === "derived-from" || x.kind === "user") &&
    (x.label === undefined || isStr(x.label)) &&
    isNum(x.createdAt)
  );
}

function remap(c: Case, evidence: Evidence[], links: Link[]) {
  const idMap = new Map<string, string>();
  const newCaseId = ulid();
  for (const e of evidence) idMap.set(e.id, ulid());
  const now = Date.now();
  return {
    c: { ...c, id: newCaseId, title: `${c.title} (copy)`, createdAt: now, updatedAt: now },
    evidence: evidence.map((e) => ({
      ...e,
      id: idMap.get(e.id)!,
      caseId: newCaseId,
      provenance: {
        ...e.provenance,
        sourceEvidenceId: e.provenance.sourceEvidenceId && idMap.get(e.provenance.sourceEvidenceId),
      },
    })),
    links: links.map((l) => ({ ...l, id: ulid(), caseId: newCaseId, fromId: idMap.get(l.fromId)!, toId: idMap.get(l.toId)! })),
  };
}
