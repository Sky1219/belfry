import { ulid } from "ulid";
import { BelfryDB } from "./db";
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

  async deleteCase(id: string): Promise<void> {
    await this.db.transaction("rw", [this.db.cases, this.db.evidence, this.db.links, this.db.changes], async () => {
      const cur = await this.mustGet(this.db.cases.get(id), "case", id);
      await this.db.cases.put({ ...cur, deleted: true, updatedAt: Date.now() });
      await this.log("case", id, "delete");
      for (const e of await this.db.evidence.where("caseId").equals(id).toArray()) {
        if (e.deleted) continue;
        await this.db.evidence.put({ ...e, deleted: true, updatedAt: Date.now() });
        await this.log("evidence", e.id, "delete");
      }
      for (const l of await this.db.links.where("caseId").equals(id).toArray()) {
        if (l.deleted) continue;
        await this.db.links.put({ ...l, deleted: true });
        await this.log("link", l.id, "delete");
      }
    });
    this.emit(id);
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

  async deleteEvidence(id: string): Promise<void> {
    let caseId = "";
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
      }
    });
    this.emit(caseId);
  }

  async listEvidence(caseId: string): Promise<Evidence[]> {
    const all = await this.db.evidence.where("caseId").equals(caseId).toArray();
    return all.filter((e) => !e.deleted).sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  // ---------- links ----------

  async addLink(input: NewLink): Promise<Link> {
    const l: Link = { ...input, id: ulid(), createdAt: Date.now(), deleted: false };
    await this.write("link", l.id, "put", () => this.db.links.put(l));
    this.emit(l.caseId);
    return l;
  }

  async deleteLink(id: string): Promise<void> {
    const cur = await this.mustGet(this.db.links.get(id), "link", id);
    await this.write("link", id, "delete", () => this.db.links.put({ ...cur, deleted: true }));
    this.emit(cur.caseId);
  }

  async listLinks(caseId: string): Promise<Link[]> {
    const all = await this.db.links.where("caseId").equals(caseId).toArray();
    return all.filter((l) => !l.deleted).sort((a, b) => (a.id < b.id ? -1 : 1));
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
