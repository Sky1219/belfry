import type { Box } from "../models/types";

export interface LocalNoteInput {
  label: string | null;
  score: number | null;
  color: string;
  box: Box;
  tVisibleS: number;
}

/** A plain, factual note built without any LLM: label, color, size, position, time in view, confidence. */
export function localNote(i: LocalNoteInput): string {
  const a = (i.box[2] - i.box[0]) * (i.box[3] - i.box[1]);
  const size = a < 0.05 ? "small" : a < 0.2 ? "medium" : "large";
  const cx = (i.box[0] + i.box[2]) / 2;
  const cy = (i.box[1] + i.box[3]) / 2;
  const col = cx < 1 / 3 ? "left" : cx > 2 / 3 ? "right" : "center";
  const row = cy < 1 / 3 ? "upper" : cy > 2 / 3 ? "lower" : "";
  const where = !row && col === "center" ? "center" : !row ? col : `${row} ${col}`;
  let note = `${(i.label ?? "unidentified object").toUpperCase()} — ${i.color}, ${size}, ${where} of frame.`;
  if (i.tVisibleS >= 1) note += ` In view ${Math.round(i.tVisibleS)} s.`;
  if (i.score !== null) note += ` Detector confidence ${Math.round(i.score * 100)}%.`;
  return note;
}
