export type Verdict = "consistent" | "no-sign" | "inconclusive";

/** Bands a test score. A missing or NaN score can't support either claim. */
export function verdictFor(score: number | null, t: { inconclusiveAt: number; consistentAt: number }): Verdict {
  if (score === null || Number.isNaN(score)) return "inconclusive";
  if (score >= t.consistentAt) return "consistent";
  if (score >= t.inconclusiveAt) return "inconclusive";
  return "no-sign";
}

/** Finding title in the only wording Belfry uses for forensic tests. */
export function verdictTitle(test: string, v: Verdict, subject: string): string {
  if (v === "consistent") return `${test}: consistent with ${subject}`;
  if (v === "no-sign") return `${test}: no sign of ${subject}`;
  return `${test}: inconclusive`;
}
