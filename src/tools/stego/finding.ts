import type { FindingDetail } from "../../store/schema";
import { verdictFor, verdictTitle, type Verdict } from "../imagekit/verdict";

const TEST = "Hidden data";
const SUBJECT = "sequential LSB embedding";
const LIMIT = "Only detects sequential LSB embedding. Absence of a signal isn't proof of a clean image.";

const CHI_BANDS = { inconclusiveAt: 0.5, consistentAt: 0.95 };
/** RS alone can lift a reading to inconclusive, never to consistent (Ruling P3-R6). */
const RS_INCONCLUSIVE_AT = 0.05;
const BANDS =
  "Consistent when the chi-square p at 100% is 0.95 or more; inconclusive when it is 0.50 or more, or the RS estimate is 0.05 or more. RS alone never reads consistent.";
/** Real photos at 50% sequential embedding read 0.29-0.55 (Ruling P3-R10). */
const RS_LOW = "The RS estimate reads low for sequential embedding.";
/** Said when RS alone made the reading inconclusive (Ruling P3-R6). */
const FLAT = "Text, screenshots, flat graphics and small images can read this high with no hidden message.";

/** The most of a decoded message the panel and the pinned card show (Ruling P3-R9). */
export const SHOWN_BYTES = 4096;

export type StegoVerdict = Verdict | "payload";

/** Rounds to the 2 places the readout shows, so a shown number can never contradict its band. */
export const round2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * How much of the image reads embedded: the share read at the last bar of the
 * leading run whose 2 dp p is 0.95 or more, or 0 when the first bar isn't.
 * The chart's key and its amber bars both follow it.
 */
export function embeddedShare(chi: Array<{ fraction: number; p: number }>): number {
  let share = 0;
  for (const e of chi) {
    if (round2(e.p) < CHI_BANDS.consistentAt) break;
    share = e.fraction;
  }
  return share;
}

/** The first `max` bytes of UTF-8 `bytes` as text, cut back to a character boundary so nothing shows as U+FFFD. */
function head(bytes: Uint8Array, max: number): string {
  let cut = max;
  while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) cut--;
  return new TextDecoder().decode(bytes.subarray(0, cut));
}

/**
 * The Steganography lab's finding from a decoded payload (or none), the
 * chi-square attack and the RS estimate. The verdict is returned so callers
 * decide on it rather than on the title's wording; `bytes` is a payload's
 * full size, which its shown text may be cut short of.
 */
export function stegoFinding(r: {
  payload: string | null;
  chi: Array<{ fraction: number; p: number }>;
  rs: { rate: number | null };
}): { title: string; body: string; detail?: FindingDetail; verdict: StegoVerdict; bytes?: number } {
  const full = r.chi.find((e) => e.fraction === 1) ?? r.chi[r.chi.length - 1];
  const chiP = full ? round2(full.p) : 0;
  const rate = r.rs.rate === null ? null : round2(r.rs.rate);

  const numbers = `Chi-square p at 100% of the image's low bits: ${chiP.toFixed(2)}. RS estimate of the embedded share: ${rate === null ? "--" : rate.toFixed(2)}.`;

  if (r.payload !== null) {
    const encoded = new TextEncoder().encode(r.payload);
    const bytes = encoded.length;
    const cut = bytes > SHOWN_BYTES;
    // the full text stays in the image; the finding carries what a card can show
    const text = cut ? head(encoded, SHOWN_BYTES) : r.payload;
    const note = cut ? ` ${bytes} bytes; showing the first 4 KB.` : "";
    return {
      verdict: "payload",
      bytes,
      title: `${TEST}: LSB payload found`,
      body: `A Belfry LSB message of ${bytes} bytes was read from the image.${note} ${numbers} ${LIMIT}`,
      detail: { kind: "decode", scheme: "LSB", text },
    };
  }

  // only the chi-square p can read consistent; RS (or a missing rate) can at most lift no sign to inconclusive
  const chiVerdict = verdictFor(chiP, CHI_BANDS);
  const rsHigh = rate !== null && rate >= RS_INCONCLUSIVE_AT;
  const verdict: Verdict = chiVerdict === "no-sign" && rsHigh ? "inconclusive" : chiVerdict;
  const rsOnly = chiVerdict === "no-sign" && rsHigh;

  const detail: FindingDetail =
    rate === null
      ? { kind: "measurement", value: null, unit: "of capacity (estimate)" }
      : { kind: "measurement", value: rate, unit: "of capacity (estimate)", decimals: 2 };

  return {
    verdict,
    title: verdictTitle(TEST, verdict, SUBJECT),
    body: `${numbers} ${BANDS} ${RS_LOW} ${rsOnly ? `${FLAT} ` : ""}${LIMIT}`,
    detail,
  };
}
