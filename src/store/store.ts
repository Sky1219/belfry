import { ulid } from "ulid";
import { BelfryDB } from "./db";
import { sha256Hex } from "./blobs";
import type {
  Case,
  ChangeEntry,
  Evidence,
  Link,
  NewEvidence,
  NewLink,
  RecordType,
} from "./schema";

type Listener = () => void;

/** What a soft delete removed, so it can be undone precisely. */
export interface DeleteReceipt {
  evidenceIds: string[];
  linkIds: string[];
}

export interface CaseSummary {
  /** Stable case number by creation order. */
  number: number;
  evidence: number;
  links: number;
  /** Latest change to the case, its evidence or its links (epoch ms). */
  lastActivity: number;
}

/**
 * All reads and writes of cases, evidence and links go through this class.
 * Every write records a change-log entry in the same transaction, so a future
 * sync service can replay the log. Deletes are soft.
 */
export class EvidenceStore {
  /** False when IndexedDB was unavailable and data lives only in memory. */
  readonly persistent: boolean;
  readonly db: BelfryDB;
  private listeners = new Map<string, Set<Listener>>();

  private constructor(db: BelfryDB, persistent: boolean) {
    this.db = db;
    this.persistent = persistent;
  }

  static async open(name = "belfry"): Promise<EvidenceStore> {
    if (typeof indexedDB !== "undefined" && indexedDB) {
      try {
        const db = new BelfryDB(name);
        await db.open();
        return new EvidenceStore(db, true);
      } catch (e) {
        console.warn("IndexedDB unavailable, falling back to memory:", e);
      }
    }
    const { IDBFactory, IDBKeyRange } = await import("fake-indexeddb");
    const db = new BelfryDB(name, { indexedDB: new IDBFactory(), IDBKeyRange });
    await db.open();
    return new EvidenceStore(db, false);
  }

  // ---------- cases ----------

  async createCase(title: string): Promise<Case> {
    const now = Date.now();
    const c: Case = { id: ulid(), title, status: "open", createdAt: now, updatedAt: now, deleted: false };
    await this.write("case", c.id, "put", () => this.db.cases.put(c));
    this.emit(c.id);
    return c;
  }

  async listCases(): Promise<Case[]> {
    const all = await this.db.cases.toArray();
    return all.filter((c) => !c.deleted).sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  async getCase(id: string): Promise<Case | undefined> {
    const c = await this.db.cases.get(id);
    return c && !c.deleted ? c : undefined;
  }

  async updateCase(id: string, patch: Partial<Pick<Case, "title" | "status">>): Promise<Case> {
    const cur = await this.mustGet(this.db.cases.get(id), "case", id);
    const next: Case = { ...cur, ...patch, updatedAt: Date.now() };
    await this.write("case", id, "put", () => this.db.cases.put(next));
    this.emit(id);
    return next;
  }

  /** Soft-deletes a case with its evidence and links; the receipt lets `restoreCase` undo exactly this. */
  async deleteCase(id: string): Promise<DeleteReceipt> {
    const receipt: DeleteReceipt = { evidenceIds: [], linkIds: [] };
    await this.db.transaction("rw", [this.db.cases, this.db.evidence, this.db.links, this.db.changes], async () => {
      const cur = await this.mustGet(this.db.cases.get(id), "case", id);
      await this.db.cases.put({ ...cur, deleted: true, updatedAt: Date.now() });
      await this.log("case", id, "delete");
      for (const e of await this.db.evidence.where("caseId").equals(id).toArray()) {
        if (e.deleted) continue;
        await this.db.evidence.put({ ...e, deleted: true, updatedAt: Date.now() });
        await this.log("evidence", e.id, "delete");
        receipt.evidenceIds.push(e.id);
      }
      for (const l of await this.db.links.where("caseId").equals(id).toArray()) {
        if (l.deleted) continue;
        await this.db.links.put({ ...l, deleted: true });
        await this.log("link", l.id, "delete");
        receipt.linkIds.push(l.id);
      }
    });
    this.emit(id);
    return receipt;
  }

  /** Undoes `deleteCase`: brings back the case and exactly the records that delete removed. */
  async restoreCase(id: string, receipt: DeleteReceipt): Promise<void> {
    await this.db.transaction("rw", [this.db.cases, this.db.evidence, this.db.links, this.db.changes], async () => {
      const cur = await this.db.cases.get(id);
      if (!cur) return;
      await this.db.cases.put({ ...cur, deleted: false, updatedAt: Date.now() });
      await this.log("case", id, "put");
      await this.undelete(receipt);
    });
    this.emit(id);
  }

  /**
   * Stable case numbers (1, 2, 3…) by creation order, counting deleted cases
   * too, so a number never moves to a different case.
   */
  async caseNumber(id: string): Promise<number> {
    return (await this.db.cases.where("id").belowOrEqual(id).count()) || 1;
  }

  /** Per-case counts and last activity, for the case list. */
  async caseSummaries(): Promise<Map<string, CaseSummary>> {
    const out = new Map<string, CaseSummary>();
    const cases = await this.db.cases.toArray();
    const sorted = [...cases].sort((a, b) => (a.id < b.id ? -1 : 1));
    sorted.forEach((c, i) => out.set(c.id, { number: i + 1, evidence: 0, links: 0, lastActivity: c.updatedAt }));
    for (const e of await this.db.evidence.toArray()) {
      const s = out.get(e.caseId);
      if (!s || e.deleted) continue;
      s.evidence++;
      s.lastActivity = Math.max(s.lastActivity, e.updatedAt);
    }
    for (const l of await this.db.links.toArray()) {
      const s = out.get(l.caseId);
      if (!s || l.deleted) continue;
      s.links++;
      s.lastActivity = Math.max(s.lastActivity, l.createdAt);
    }
    return out;
  }

  // ---------- evidence ----------

  async addEvidence(input: NewEvidence): Promise<Evidence> {
    const now = Date.now();
    const e: Evidence = {
      tags: [],
      meta: {},
      position: { x: 0, y: 0 },
      ...input,
      id: ulid(),
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    await this.write("evidence", e.id, "put", () => this.db.evidence.put(e));
    this.emit(e.caseId);
    return e;
  }

  async getEvidence(id: string): Promise<Evidence | undefined> {
    const e = await this.db.evidence.get(id);
    return e && !e.deleted ? e : undefined;
  }

  async updateEvidence(
    id: string,
    patch: Partial<Pick<Evidence, "title" | "body" | "tags" | "position" | "meta" | "blobHash" | "thumbHash">>,
  ): Promise<Evidence> {
    const cur = await this.mustGet(this.db.evidence.get(id), "evidence", id);
    const next: Evidence = { ...cur, ...patch, updatedAt: Date.now() };
    await this.write("evidence", id, "put", () => this.db.evidence.put(next));
    this.emit(next.caseId);
    return next;
  }

  /** Soft-deletes evidence and its links; the receipt lets `restoreEvidence` undo exactly this. */
  async deleteEvidence(id: string): Promise<DeleteReceipt> {
    let caseId = "";
    const receipt: DeleteReceipt = { evidenceIds: [id], linkIds: [] };
    await this.db.transaction("rw", [this.db.evidence, this.db.links, this.db.changes], async () => {
      const cur = await this.mustGet(this.db.evidence.get(id), "evidence", id);
      caseId = cur.caseId;
      await this.db.evidence.put({ ...cur, deleted: true, updatedAt: Date.now() });
      await this.log("evidence", id, "delete");
      const links = await this.db.links.where("caseId").equals(cur.caseId).toArray();
      for (const l of links) {
        if (l.deleted || (l.fromId !== id && l.toId !== id)) continue;
        await this.db.links.put({ ...l, deleted: true });
        await this.log("link", l.id, "delete");
        receipt.linkIds.push(l.id);
      }
    });
    this.emit(caseId);
    return receipt;
  }

  /** Undoes `deleteEvidence` (or `deleteLink`, with an empty evidence list). */
  async restoreEvidence(receipt: DeleteReceipt): Promise<void> {
    let caseId = "";
    await this.db.transaction("rw", [this.db.evidence, this.db.links, this.db.changes], async () => {
      caseId = await this.undelete(receipt);
    });
    if (caseId) this.emit(caseId);
  }

  async listEvidence(caseId: string): Promise<Evidence[]> {
    const all = await this.db.evidence.where("caseId").equals(caseId).toArray();
    return all.filter((e) => !e.deleted).sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  /**
   * Exhibit numbers for a case's evidence: 1, 2, 3… by creation order,
   * counting deleted evidence too, so a number never moves to another exhibit.
   */
  async exhibitNumbers(caseId: string): Promise<Map<string, number>> {
    const all = await this.db.evidence.where("caseId").equals(caseId).toArray();
    all.sort((a, b) => (a.id < b.id ? -1 : 1));
    return new Map(all.map((e, i) => [e.id, i + 1]));
  }

  // ---------- links ----------

  async addLink(input: NewLink): Promise<Link> {
    const l: Link = { ...input, id: ulid(), createdAt: Date.now(), deleted: false };
    await this.write("link", l.id, "put", () => this.db.links.put(l));
    this.emit(l.caseId);
    return l;
  }

  async deleteLink(id: string): Promise<DeleteReceipt> {
    const cur = await this.mustGet(this.db.links.get(id), "link", id);
    await this.write("link", id, "delete", () => this.db.links.put({ ...cur, deleted: true }));
    this.emit(cur.caseId);
    return { evidenceIds: [], linkIds: [id] };
  }

  async listLinks(caseId: string): Promise<Link[]> {
    const all = await this.db.links.where("caseId").equals(caseId).toArray();
    return all.filter((l) => !l.deleted).sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  // ---------- blobs ----------

  /** Stores bytes under their SHA-256; storing the same bytes twice is a no-op. */
  async putBlob(bytes: Uint8Array, mime: string): Promise<string> {
    const hash = await sha256Hex(bytes);
    await this.db.transaction("rw", [this.db.blobs, this.db.changes], async () => {
      if (await this.db.blobs.get(hash)) return;
      await this.db.blobs.put({ hash, mime, size: bytes.byteLength, bytes });
      await this.log("blob", hash, "put");
    });
    return hash;
  }

  async getBlob(hash: string): Promise<{ bytes: Uint8Array; mime: string } | undefined> {
    const b = await this.db.blobs.get(hash);
    return b && { bytes: b.bytes, mime: b.mime };
  }

  // ---------- change log + subscriptions ----------

  async changes(sinceSeq = 0): Promise<ChangeEntry[]> {
    return this.db.changes.where("seq").above(sinceSeq).toArray();
  }

  subscribe(caseId: string, fn: Listener): () => void {
    let set = this.listeners.get(caseId);
    if (!set) this.listeners.set(caseId, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  /** Notify subscribers of a case (also used by import/export helpers). */
  emit(caseId: string): void {
    for (const fn of this.listeners.get(caseId) ?? []) fn();
    for (const fn of this.listeners.get("*") ?? []) fn();
  }

  // ---------- internals ----------

  /** Clears `deleted` on the receipt's records; must run inside a transaction over evidence, links and changes. Returns their case. */
  private async undelete(receipt: DeleteReceipt): Promise<string> {
    let caseId = "";
    for (const id of receipt.evidenceIds) {
      const e = await this.db.evidence.get(id);
      if (!e) continue;
      caseId = e.caseId;
      await this.db.evidence.put({ ...e, deleted: false, updatedAt: Date.now() });
      await this.log("evidence", id, "put");
    }
    for (const id of receipt.linkIds) {
      const l = await this.db.links.get(id);
      if (!l) continue;
      caseId = l.caseId;
      await this.db.links.put({ ...l, deleted: false });
      await this.log("link", id, "put");
    }
    return caseId;
  }

  /** Runs a record write and its change entry in one transaction. */
  private async write(type: RecordType, id: string, op: "put" | "delete", fn: () => Promise<unknown>) {
    const tables = { case: this.db.cases, evidence: this.db.evidence, link: this.db.links, blob: this.db.blobs };
    await this.db.transaction("rw", [tables[type], this.db.changes], async () => {
      await fn();
      await this.log(type, id, op);
    });
  }

  /** Appends a change entry; must be called inside a transaction that includes `changes`. */
  async log(recordType: RecordType, recordId: string, op: "put" | "delete"): Promise<void> {
    await this.db.changes.add({ recordType, recordId, op, at: Date.now() } as ChangeEntry);
  }

  private async mustGet<T extends { deleted: boolean }>(p: Promise<T | undefined>, kind: string, id: string): Promise<T> {
    const v = await p;
    if (!v || v.deleted) throw new Error(`${kind} ${id} not found`);
    return v;
  }
}
