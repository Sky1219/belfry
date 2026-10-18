/** Belfry's persistent records. Timestamps are epoch milliseconds; ids are ULIDs. */

export type CaseStatus = "open" | "closed";

export interface Case {
  id: string;
  title: string;
  status: CaseStatus;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

export type EvidenceType = "image" | "video" | "audio" | "note" | "finding";

export interface Provenance {
  toolId?: string;
  sourceEvidenceId?: string;
  createdAt: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface Evidence {
  id: string;
  caseId: string;
  type: EvidenceType;
  title: string;
  body?: string;
  tags: string[];
  blobHash?: string;
  thumbHash?: string;
  provenance: Provenance;
  position: Position;
  meta: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

export type NewEvidence = Omit<Evidence, "id" | "createdAt" | "updatedAt" | "deleted" | "tags" | "meta" | "position"> &
  Partial<Pick<Evidence, "tags" | "meta" | "position">>;

export type LinkKind = "derived-from" | "user";

export interface Link {
  id: string;
  caseId: string;
  fromId: string;
  toId: string;
  kind: LinkKind;
  label?: string;
  createdAt: number;
  deleted: boolean;
}

export type NewLink = Omit<Link, "id" | "createdAt" | "deleted">;

export interface BlobRecord {
  hash: string;
  mime: string;
  size: number;
  bytes: Uint8Array;
}

export type RecordType = "case" | "evidence" | "link" | "blob";

export interface ChangeEntry {
  seq: number;
  recordType: RecordType;
  recordId: string;
  op: "put" | "delete";
  at: number;
}
