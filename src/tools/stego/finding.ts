import type { FindingDetail } from "../../store/schema";
import { verdictFor, verdictTitle, type Verdict } from "../imagekit/verdict";

const TEST = "Hidden data";
const SUBJECT = "sequential LSB embedding";
const LIMIT = "Only detects sequential LSB embedding. Absence of a signal isn't proof of a clean image.";

const CHI_BANDS = { inconclusiveAt: 0.5, consistentAt: 0.95 };
const RS_BANDS = { inconclusiveAt: 0.05, consistentAt: 0.1 };
const BANDS =
  "Consistent when the chi-square p at 100% is 0.95 or more, or the RS estimate is 0.10 or more; inconclusive from 0.50 or 0.05.";

/** The rate's own uncertainty: RS estimates are good to about 5% of the capacity. */
const RATE_UNCERTAINTY = 0.05;

export type StegoVerdict = Verdict | "payload";

const RANK: Record<Verdict, number> = { "no-sign": 0, inconclusive: 1, consistent: 2 };

/** Rounds to the 2 places the readout shows, so a shown number can never contradict its band. */
const round2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * The Steganography lab's finding from a decoded payload (or none), the
 * chi-square attack and the RS estimate. The verdict is returned so callers
 * decide on it rather than on the title's wording.
 */
export function stegoFinding(r: {
  payload: string | null;
  chi: Array<{ fraction: number; p: number }>;
  rs: { rate: number | null };
}): { title: string; body: string; detail?: FindingDetail; verdict: StegoVerdict } {
  const full = r.chi.find((e) => e.fraction === 1) ?? r.chi[r.chi.length - 1];
  const chiP = full ? round2(full.p) : 0;
  const rate = r.rs.rate === null ? null : round2(r.rs.rate);

  const numbers = `Chi-square p at 100% of the capacity: ${chiP.toFixed(2)}. RS estimate of the embedded share: ${rate === null ? "--" : rate.toFixed(2)}.`;

  if (r.payload !== null) {
    const bytes = new TextEncoder().encode(r.payload).length;
    return {
      verdict: "payload",
      title: `${TEST}: LSB payload found`,
      body: `A Belfry LSB message of ${bytes} bytes was read from the image. ${numbers} ${LIMIT}`,
      detail: { kind: "decode", scheme: "LSB", text: r.payload },
    };
  }

  // a missing rate can't support either claim, so only the chi-square p speaks for it
  const chiVerdict = verdictFor(chiP, CHI_BANDS);
  const rsVerdict: Verdict = rate === null ? "no-sign" : verdictFor(rate, RS_BANDS);
  const verdict = RANK[chiVerdict] >= RANK[rsVerdict] ? chiVerdict : rsVerdict;

  const detail: FindingDetail =
    rate === null
      ? { kind: "measurement", value: null, unit: "of capacity" }
      : { kind: "measurement", value: rate, unit: "of capacity", uncertainty: RATE_UNCERTAINTY, decimals: 2 };

  return {
    verdict,
    title: verdictTitle(TEST, verdict, SUBJECT),
    body: `${numbers} ${BANDS} ${LIMIT}`,
    detail,
  };
}
