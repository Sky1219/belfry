import Dexie, { type DexieOptions, type Table } from "dexie";
import type { BlobRecord, Case, ChangeEntry, Evidence, Link } from "./schema";

export class BelfryDB extends Dexie {
  cases!: Table<Case, string>;
  evidence!: Table<Evidence, string>;
  links!: Table<Link, string>;
  blobs!: Table<BlobRecord, string>;
  changes!: Table<ChangeEntry, number>;

  constructor(name: string, options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
      cases: "id",
      evidence: "id, caseId",
      links: "id, caseId",
      blobs: "hash",
      changes: "++seq",
    });
  }
}
