import { describe, expect, it } from "vitest";
import { pairStyle } from "../../src/tools/fingerprint/comparison";

describe("pairStyle (Ruling P2-R7)", () => {
  it("draws matched pairs in amber only on a consistent verdict", () => {
    const s = pairStyle({ verdict: "consistent", score: 0.67 }, 19);
    expect(s.lines).toBe("amber");
    expect(s.key).toBe("19 matched pairs joined in amber");
  });

  it("draws pairs in steel on no sign or inconclusive, without calling them a finding", () => {
    for (const verdict of ["no-sign", "inconclusive"] as const) {
      const s = pairStyle({ verdict, score: 0.18 }, 5);
      expect(s.lines).toBe("steel");
      expect(s.key).toContain("5 pairs");
      expect(s.key).toContain("steel");
      expect(s.key).not.toMatch(/amber|match(ed)? pairs?/i);
    }
    expect(pairStyle({ verdict: "no-sign", score: 0.04 }, 1).key).toContain("1 pair ");
  });

  it("draws no pair lines and no matched count when there is too little ridge detail", () => {
    const s = pairStyle({ verdict: "inconclusive", score: null }, 2);
    expect(s.lines).toBe("none");
    expect(s.key).toBe("Not enough ridge detail to pair minutiae");
    expect(s.key).not.toMatch(/\d/);
  });
});
