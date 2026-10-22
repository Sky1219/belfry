/** The time and bearing fields: filled from the photo or the demo, and read back as the solver wants them. */

import type { PhotoMetadata } from "../photo/metadata";
import { MSG_TIME, photoTimeUtc } from "./shadow";

export const MSG_OFFSET = "Enter the UTC offset the photo was taken in: the same clock time is a different sun in every zone.";
export const MSG_OFFSET_FORMAT = "Type the UTC offset as hours east of UTC, like +01:00 or -05:00.";
export const MSG_BEARING_FORMAT = "Type the shadow's bearing in degrees from true north, or leave it empty.";

export interface TimeFields {
  /** YYYY-MM-DD, as a date input holds it. */
  date: string;
  /** HH:MM or HH:MM:SS, as a time input holds it. */
  time: string;
  /** As typed: "+01:00", "+1", "-5:30". */
  offset: string;
}

/** Where the fields' first values came from, for the line that says so. */
export type TimeSource = "exif" | "exif-no-offset" | "demo" | "none";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A UTC offset as people type it, in minutes east of UTC: "+01:00", "+0100", "+1", "-5:30", "0",
 * "UTC+2". Null for anything else, an empty field included. Hours run to 14 and minutes to 59.
 */
export function readOffset(s: string): number | null {
  const m = /^(?:UTC|GMT)?\s*([+\-−])?\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(s.trim());
  if (!m) return null;
  const hours = Number(m[2]);
  const minutes = m[3] ? Number(m[3]) : 0;
  if (hours > 14 || minutes > 59) return null;
  return (m[1] === "-" || m[1] === "−" ? -1 : 1) * (hours * 60 + minutes);
}

/** Minutes east of UTC as EXIF writes them: "+01:00", "-05:30". */
export function formatOffset(minutes: number): string {
  const a = Math.abs(minutes);
  return `${minutes < 0 ? "-" : "+"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/**
 * The instant the fields name, or what is missing. An empty or unreadable offset is never
 * guessed: the same clock time is a different sun in every zone.
 */
export function timeFromFields(f: TimeFields): { timeUtc: Date } | { error: string } {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.date.trim());
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(f.time.trim());
  if (!d || !t) return { error: MSG_TIME };
  if (f.offset.trim() === "") return { error: MSG_OFFSET };
  const offset = readOffset(f.offset);
  if (offset === null) return { error: MSG_OFFSET_FORMAT };
  // the same reading of a clock and its offset as the photo's own EXIF gets
  const timeUtc = photoTimeUtc({
    dateTimeOriginal: `${d[1]}:${d[2]}:${d[3]} ${t[1]}:${t[2]}:${t[3] ?? "00"}`,
    offsetTimeOriginal: formatOffset(offset),
  });
  return timeUtc ? { timeUtc } : { error: MSG_TIME };
}

/** The bearing field: undefined when empty, the number when it is one, else an error. Folding into [0, 360) is the solver's. */
export function bearingFromField(s: string): { bearingDeg?: number } | { error: string } {
  const v = s.trim().replace(/−/g, "-").replace(/°$/, "");
  if (v === "") return {};
  const n = Number(v);
  return Number.isFinite(n) ? { bearingDeg: n } : { error: MSG_BEARING_FORMAT };
}

/** The fields for an instant, shown in UTC (the demo's staged truth). */
export function fieldsFromUtc(t: Date): TimeFields {
  const iso = t.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19), offset: "+00:00" };
}

/**
 * The fields from a photo's EXIF: its local clock reading and its offset when both are there and
 * make a real instant; the clock reading alone, offset empty, when the camera didn't record one
 * (most cameras); otherwise nothing.
 */
export function fieldsFromMetadata(meta: Pick<PhotoMetadata, "dateTimeOriginal" | "offsetTimeOriginal">): {
  fields: TimeFields;
  source: TimeSource;
} {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(meta.dateTimeOriginal?.trim() ?? "");
  if (!m) return { fields: { date: "", time: "", offset: "" }, source: "none" };
  const local = { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}:${m[6]}` };
  if (photoTimeUtc(meta)) return { fields: { ...local, offset: meta.offsetTimeOriginal!.trim() }, source: "exif" };
  return { fields: { ...local, offset: "" }, source: "exif-no-offset" };
}
