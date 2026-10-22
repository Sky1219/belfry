import { describe, expect, it } from "vitest";
import { formatFindingDetail, readFindingDetail } from "../../src/store/schema";
import { fingerprintFinding, matchMinutiae } from "../../src/tools/fingerprint/match";
import { analysePrint, type Minutia } from "../../src/tools/fingerprint/pipeline";
import { synthPrint } from "../../src/tools/fingerprint/synth";
import { mulberry32 } from "../../src/tools/imagekit/rng";

const LIMIT = "Hobby-grade matching of two photos. This is not an identification.";
const CAVEAT =
  "Photos taken at different distances or in different light can score low for the same finger; a low score is not evidence of a different finger.";

/** n minutiae scattered over a 300 x 300 field with random directions. */
function scatter(seed: number, n = 40): Minutia[] {
  const rand = mulberry32(seed);
  return Array.from({ length: n }, () => ({
    x: 20 + rand() * 260,
    y: 20 + rand() * 260,
    angle: (rand() * 2 - 1) * Math.PI,
    kind: rand() < 0.5 ? ("ending" as const) : ("bifurcation" as const),
  }));
}

function wrap(a: number): number {
  let t = a % (2 * Math.PI);
  if (t > Math.PI) t -= 2 * Math.PI;
  if (t <= -Math.PI) t += 2 * Math.PI;
  return t;
}

/** Rotates every minutia by `deg` about the origin, then shifts it. */
function moved(ms: Minutia[], deg: number, dx: number, dy: number): Minutia[] {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return ms.map((m) => ({ ...m, x: c * m.x - s * m.y + dx, y: s * m.x + c * m.y + dy, angle: wrap(m.angle + t) }));
}

/** n minutiae in a row, far apart, so a count is all a finding test needs. */
const row = (n: number): Minutia[] =>
  Array.from({ length: n }, (_, i) => ({ x: 20 + i * 15, y: 50, angle: 0, kind: "ending" as const }));

describe("matchMinutiae", () => {
  const a = scatter(7);

  it("matches a rotated and shifted copy completely", () => {
    const m = matchMinutiae(a, moved(a, 15, 30, -20));
    expect(m.score).toBe(1);
    expect(m.matched).toBe(40);
    expect(m.pairs).toHaveLength(40);
    expect(m.transform.theta).toBeCloseTo((15 * Math.PI) / 180, 6);
  });

  it("pairs each minutia with its own copy", () => {
    const m = matchMinutiae(a, moved(a, 15, 30, -20));
    expect(m.pairs.every(([i, j]) => i === j)).toBe(true);
  });

  it("still matches when the second print is upside down", () => {
    expect(matchMinutiae(a, moved(a, 180, 300, 300)).score).toBe(1);
  });

  it("is one-to-one", () => {
    const m = matchMinutiae(a, moved(a, 15, 30, -20));
    expect(new Set(m.pairs.map((p) => p[0])).size).toBe(m.pairs.length);
    expect(new Set(m.pairs.map((p) => p[1])).size).toBe(m.pairs.length);
  });

  it("survives dropped minutiae and 2 px of jitter", () => {
    const rand = mulberry32(99);
    const b = moved(a, -25, 12, 40)
      .filter(() => rand() >= 0.2)
      .map((q) => ({ ...q, x: q.x + (rand() * 2 - 1) * 2, y: q.y + (rand() * 2 - 1) * 2 }));
    expect(matchMinutiae(a, b).score).toBeGreaterThanOrEqual(0.6);
  });

  it("scores unrelated sets low", () => {
    expect(matchMinutiae(scatter(1), scatter(2)).score).toBeLessThanOrEqual(0.2);
  });

  it("reads an empty print as no match rather than dividing by zero", () => {
    const m = matchMinutiae([], a);
    expect(m.score).toBe(0);
    expect(m.matched).toBe(0);
  });

  it("matches 150 against 150 minutiae within 500 ms (Ruling P2-R10)", () => {
    const a150 = scatter(21, 150);
    const b150 = scatter(22, 150);
    matchMinutiae(a150, b150); // warm the JIT
    const t = performance.now();
    matchMinutiae(a150, b150);
    expect(performance.now() - t).toBeLessThanOrEqual(500);
    const t2 = performance.now();
    matchMinutiae(a150, moved(a150, 30, 15, -10));
    expect(performance.now() - t2).toBeLessThanOrEqual(500);
  });

  it("only aligns on pairs of the same kind (Ruling P2-R10)", () => {
    // one minutia each, of different kinds: no alignment is proposed, so nothing pairs
    const ending = [{ x: 50, y: 50, angle: 0, kind: "ending" as const }];
    const fork = [{ x: 80, y: 60, angle: 1, kind: "bifurcation" as const }];
    expect(matchMinutiae(ending, fork).matched).toBe(0);
    expect(matchMinutiae(ending, [{ ...fork[0], kind: "ending" }]).matched).toBe(1);
  });

  it("honours a tighter tolerance", () => {
    // Every other minutia is 6 px off: inside 10 px, outside 3 px, and no single shift fixes both halves.
    const b = a.map((q, i) => (i % 2 ? { ...q, x: q.x + 6 } : q));
    expect(matchMinutiae(a, b, { distPx: 10, angleDeg: 20 }).score).toBe(1);
    expect(matchMinutiae(a, b, { distPx: 3, angleDeg: 20 }).score).toBeLessThanOrEqual(0.55);
  });
});

describe("matchMinutiae on analysed prints", () => {
  const analyse = (o: Parameters<typeof synthPrint>[0]) => {
    const p = synthPrint(o);
    return analysePrint(p.gray, p.width, p.height).minutiae;
  };
  const base = analyse({ seed: 3 });

  it("matches the demo pair", () => {
    const m = matchMinutiae(base, analyse({ seed: 3, rotateDeg: 15, dx: 30, dy: -20 }));
    expect(m.score).toBeGreaterThanOrEqual(0.4);
    expect(m.matched).toBeGreaterThanOrEqual(12);
  });

  it("does not match a different finger", () => {
    expect(matchMinutiae(base, analyse({ seed: 11 })).score).toBeLessThan(0.25);
  });
});

describe("fingerprintFinding", () => {
  const a = row(35);
  const b = row(35);
  const result = (score: number, matched: number) => ({
    score,
    matched,
    pairs: [] as Array<[number, number]>,
    transform: { theta: 0, tx: 0, ty: 0 },
  });

  it("calls a strong match consistent, with the score as the detail", () => {
    const f = fingerprintFinding(a, b, result(0.52, 18));
    expect(f.title).toBe("Fingerprint match: consistent with the same finger");
    expect(f.detail).toEqual({ kind: "measurement", value: 0.52, unit: "match score", decimals: 2 });
    expect(f.body.endsWith(LIMIT)).toBe(true);
    // a consistent reading needs no caveat about a low score
    expect(f.body).not.toContain(CAVEAT);
    expect(f.body).toContain("0.52");
    expect(f.body).toContain("18");
    expect(f.body).toContain("35");
  });

  it("reads on the card as on the panel, with two decimals (Ruling P2-R12)", () => {
    const card = (s: number) => formatFindingDetail(readFindingDetail({ finding: fingerprintFinding(a, b, result(s, 30)).detail })!);
    expect(card(0.7)).toBe("0.70 match score");
    expect(card(1)).toBe("1.00 match score");
    expect(card(0.3)).toBe("0.30 match score");
  });

  it("keeps the same title for identical inputs", () => {
    const f = fingerprintFinding(a, a, matchMinutiae(a, a));
    expect(f.title).toBe("Fingerprint match: consistent with the same finger");
    expect(f.detail).toMatchObject({ value: 1 });
  });

  it("bands the rounded score, so the displayed number and the verdict agree", () => {
    expect(fingerprintFinding(a, b, result(0.396, 14)).title).toBe("Fingerprint match: consistent with the same finger");
    expect(fingerprintFinding(a, b, result(0.396, 14)).detail).toMatchObject({ value: 0.4 });
    expect(fingerprintFinding(a, b, result(0.244, 9)).title).toBe("Fingerprint match: no sign of the same finger");
    expect(fingerprintFinding(a, b, result(0.246, 9)).title).toBe("Fingerprint match: inconclusive");
  });

  it("reads the middle band as inconclusive, with the score", () => {
    const f = fingerprintFinding(a, b, result(0.3, 11));
    expect(f.title).toBe("Fingerprint match: inconclusive");
    expect(f.detail).toEqual({ kind: "measurement", value: 0.3, unit: "match score", decimals: 2 });
    expect(f.body.endsWith(`${CAVEAT} ${LIMIT}`)).toBe(true);
  });

  it("reads a low score as no sign of the same finger", () => {
    const f = fingerprintFinding(a, b, result(0.08, 3));
    expect(f.title).toBe("Fingerprint match: no sign of the same finger");
    expect(f.detail).toMatchObject({ value: 0.08, decimals: 2 });
    expect(f.body.endsWith(`${CAVEAT} ${LIMIT}`)).toBe(true);
  });

  it("reads too few minutiae in either print as inconclusive, with no score", () => {
    const f = fingerprintFinding(row(8), b, result(0.9, 8));
    expect(f.title).toBe("Fingerprint match: inconclusive");
    expect(f.body).toContain("not enough ridge detail");
    expect(f.detail).toBeUndefined();
    expect(f.body.endsWith(LIMIT)).toBe(true);
    // no score, so no caveat about a low one
    expect(f.body).not.toContain(CAVEAT);
    expect(fingerprintFinding(a, row(11), result(0.9, 8)).detail).toBeUndefined();
  });

  it("reads a high score on too few matched minutiae as inconclusive (P2-R2)", () => {
    const f = fingerprintFinding(row(14), row(14), result(0.5, 7));
    expect(f.title).toBe("Fingerprint match: inconclusive");
    expect(f.body).toContain("too few matched minutiae");
    expect(f.body).toContain("The two prints have 14 and 14 minutiae, but only 7 matched; too few matched minutiae to rely on this score");
    expect(f.detail).toBeUndefined();
    expect(f.body.endsWith(`${CAVEAT} ${LIMIT}`)).toBe(true);
  });

  it("reads more than 150 minutiae in either print as too noisy, with no score (Ruling P2-R9)", () => {
    for (const [na, nb] of [[151, 35], [35, 400]]) {
      const f = fingerprintFinding(row(na), row(nb), result(0.9, 30));
      expect(f).toMatchObject({ verdict: "inconclusive", score: null, title: "Fingerprint match: inconclusive" });
      expect(f.body).toContain("too noisy to read reliably");
      expect(f.detail).toBeUndefined();
      expect(f.body.endsWith(LIMIT)).toBe(true);
      expect(f.body).not.toContain(CAVEAT);
    }
    expect(fingerprintFinding(row(150), row(150), result(0.6, 90)).verdict).toBe("consistent");
  });

  it("accepts exactly 12 matched minutiae", () => {
    expect(fingerprintFinding(row(20), row(20), result(0.6, 12)).title).toBe(
      "Fingerprint match: consistent with the same finger",
    );
  });

  it("never claims an identification", () => {
    for (const r of [result(0.9, 30), result(0.3, 11), result(0.05, 2)]) {
      const { title, body } = fingerprintFinding(a, b, r);
      expect(`${title} ${body}`).not.toMatch(/identified|match confirmed|proves/i);
    }
  });

  it("returns the verdict and the rounded score for each branch (P2-R7, P2-R8)", () => {
    expect(fingerprintFinding(a, b, result(0.523, 18))).toMatchObject({ verdict: "consistent", score: 0.52 });
    expect(fingerprintFinding(a, b, result(0.3, 11))).toMatchObject({ verdict: "inconclusive", score: 0.3 });
    expect(fingerprintFinding(a, b, result(0.08, 3))).toMatchObject({ verdict: "no-sign", score: 0.08 });
    // P2-R2: a good score on too few matched minutiae is inconclusive, but the score is still known
    expect(fingerprintFinding(row(14), row(14), result(0.5, 7))).toMatchObject({ verdict: "inconclusive", score: 0.5 });
    // too little ridge detail: no score at all
    expect(fingerprintFinding(row(8), b, result(0.9, 8))).toMatchObject({ verdict: "inconclusive", score: null });
  });
});
