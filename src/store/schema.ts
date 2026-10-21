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

/**
 * What a finding states, when it's more than an observation in words. Stored
 * as `meta.finding`; a finding without it is a plain observation. Every value
 * carries its uncertainty when the tool can measure one.
 */
export type FindingDetail =
  | {
      kind: "measurement";
      value: number | null;
      unit: string;
      uncertainty?: number;
      /** Fixed decimals for a value with no uncertainty, 0-6: 0.7 at 2 reads "0.70" (Ruling P2-R12). */
      decimals?: number;
    }
  | { kind: "location"; lat: number; lon: number; radiusM?: number }
  | { kind: "decode"; scheme: string; text: string };

export type FindingKind = FindingDetail["kind"] | "observation";

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const optFinite = (x: unknown) => x === undefined || (finite(x) && x >= 0);

/**
 * The finding detail in `meta`, validated. Anything malformed (an imported
 * file, an older tool) reads as no detail rather than breaking a card.
 */
export function readFindingDetail(meta: Record<string, unknown> | undefined): FindingDetail | null {
  const d = meta?.finding as Record<string, unknown> | undefined;
  if (!d || typeof d !== "object") return null;
  switch (d.kind) {
    case "measurement": {
      if (typeof d.unit !== "string" || !(finite(d.value) || d.value === null) || !optFinite(d.uncertainty)) return null;
      // decimals are optional: anything but a whole number from 0 to 6 is dropped, not fatal
      const { decimals, ...rest } = d;
      const ok = Number.isInteger(decimals) && (decimals as number) >= 0 && (decimals as number) <= 6;
      return (ok ? d : rest) as FindingDetail;
    }
    case "location":
      return finite(d.lat) && Math.abs(d.lat) <= 90 && finite(d.lon) && Math.abs(d.lon) <= 180 && optFinite(d.radiusM)
        ? (d as FindingDetail)
        : null;
    case "decode":
      return typeof d.scheme === "string" && typeof d.text === "string" ? (d as FindingDetail) : null;
    default:
      return null;
  }
}

export const FINDING_KIND_LABEL: Record<FindingKind, string> = {
  observation: "Observation",
  measurement: "Measurement",
  location: "Location",
  decode: "Decode",
};

/**
 * Significant figures that match the uncertainty: 12.34 ± 0.4 → "12.3 ± 0.4".
 * With no uncertainty, `decimals` fixes the places when given (0.7 → "0.70").
 */
function withUncertainty(value: number, uncertainty: number | undefined, fixed?: number): string {
  if (!uncertainty) return fixed !== undefined ? value.toFixed(fixed) : String(Number(value.toPrecision(6)));
  const decimals = Math.max(0, -Math.floor(Math.log10(uncertainty)));
  return `${value.toFixed(decimals)} ± ${uncertainty.toFixed(decimals)}`;
}

const hemi = (x: number, pos: string, neg: string) => `${Math.abs(x).toFixed(5)}° ${x >= 0 ? pos : neg}`;

/** The finding's readout line: "12.3 ± 0.4 px", "51.50120° N, 0.12460° W ± 50 m", "DTMF · 5550134". */
export function formatFindingDetail(d: FindingDetail): string {
  switch (d.kind) {
    case "measurement":
      // an unknown reading shows "--", never NaN; degrees and percent sit tight against the number
      return `${finite(d.value) ? withUncertainty(d.value, d.uncertainty, d.decimals) : "--"}${/^[°%]/.test(d.unit) ? "" : " "}${d.unit}`.trim();
    case "location": {
      const at = `${hemi(d.lat, "N", "S")}, ${hemi(d.lon, "E", "W")}`;
      return d.radiusM ? `${at} ± ${Math.round(d.radiusM)} m` : at;
    }
    case "decode":
      return `${d.scheme} · ${d.text || "--"}`;
  }
}
