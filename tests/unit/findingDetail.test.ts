import { describe, expect, test } from "vitest";
import { formatFindingDetail, readFindingDetail } from "../../src/store/schema";

describe("finding detail", () => {
  test("reads each kind and formats its readout", () => {
    const m = readFindingDetail({ finding: { kind: "measurement", value: 12.34, unit: "px", uncertainty: 0.4 } });
    expect(m && formatFindingDetail(m)).toBe("12.3 ± 0.4 px");
    const l = readFindingDetail({ finding: { kind: "location", lat: 51.5012, lon: -0.1246, radiusM: 50 } });
    expect(l && formatFindingDetail(l)).toBe("51.501° N, 0.125° W ± 50 m");
    const d = readFindingDetail({ finding: { kind: "decode", scheme: "DTMF", text: "5550134" } });
    expect(d && formatFindingDetail(d)).toBe("DTMF · 5550134");
  });

  test("uncertainty sets the decimals; none keeps the value short", () => {
    expect(formatFindingDetail({ kind: "measurement", value: 72.06, unit: "BPM", uncertainty: 3 })).toBe("72 ± 3 BPM");
    expect(formatFindingDetail({ kind: "measurement", value: 0.123456789, unit: "" })).toBe("0.123457");
    expect(formatFindingDetail({ kind: "location", lat: -33.8, lon: 151.2 })).toBe("33.80000° S, 151.20000° E");
    expect(formatFindingDetail({ kind: "measurement", value: 3, unit: "° off axis", uncertainty: 1 })).toBe("3 ± 1° off axis");
  });

  test("fixed decimals keep trailing zeros, so the card reads as the panel does (Ruling P2-R12)", () => {
    expect(formatFindingDetail({ kind: "measurement", value: 0.7, unit: "match score", decimals: 2 })).toBe("0.70 match score");
    expect(formatFindingDetail({ kind: "measurement", value: 1, unit: "match score", decimals: 2 })).toBe("1.00 match score");
    expect(formatFindingDetail({ kind: "measurement", value: 3, unit: "px", decimals: 0 })).toBe("3 px");
    // and they fix the uncertainty's places too, so value and ± read alike (Ruling P4-R10)
    expect(formatFindingDetail({ kind: "measurement", value: 12.34, unit: "px", uncertainty: 0.4, decimals: 3 })).toBe("12.340 ± 0.400 px");
    expect(formatFindingDetail({ kind: "measurement", value: 53.987, unit: "° sun elevation", uncertainty: 1.0462, decimals: 1 })).toBe(
      "54.0 ± 1.0° sun elevation",
    );
    // without decimals the uncertainty still sets them
    expect(formatFindingDetail({ kind: "measurement", value: 53.987, unit: "° sun elevation", uncertainty: 1.0462 })).toBe("54 ± 1° sun elevation");
    const m = readFindingDetail({ finding: { kind: "measurement", value: 0.7, unit: "match score", decimals: 2 } });
    expect(m && formatFindingDetail(m)).toBe("0.70 match score");
  });

  test("a location's radius sets its decimals, and reads in km from 1 km (Ruling P4-R10)", () => {
    const at = (radiusM: number) => formatFindingDetail({ kind: "location", lat: 51.508451, lon: -0.131384, radiusM });
    // a shadow fix good to about 250 km: tenths of a degree, not metres
    expect(at(248139)).toBe("51.5° N, 0.1° W ± 248 km");
    expect(at(10000)).toBe("51.5° N, 0.1° W ± 10 km");
    expect(at(9999)).toBe("51.51° N, 0.13° W ± 10 km");
    expect(at(1000)).toBe("51.51° N, 0.13° W ± 1 km");
    expect(at(999)).toBe("51.508° N, 0.131° W ± 999 m");
    expect(at(12.4)).toBe("51.508° N, 0.131° W ± 12 m");
    // a position with no radius (a photo's EXIF GPS) keeps 5 dp
    expect(formatFindingDetail({ kind: "location", lat: 51.508451, lon: -0.131384 })).toBe("51.50845° N, 0.13138° W");
  });

  test("malformed decimals are ignored, not fatal", () => {
    for (const decimals of [-1, 7, 1.5, "2", NaN, null]) {
      const m = readFindingDetail({ finding: { kind: "measurement", value: 0.7, unit: "match score", decimals } });
      expect(m).not.toBeNull();
      expect(m && formatFindingDetail(m)).toBe("0.7 match score");
    }
  });

  test("an unknown value reads as --, never NaN", () => {
    const m = readFindingDetail({ finding: { kind: "measurement", value: null, unit: "Hz" } });
    expect(m && formatFindingDetail(m)).toBe("-- Hz");
    expect(formatFindingDetail({ kind: "decode", scheme: "Morse", text: "" })).toBe("Morse · --");
  });

  test("malformed detail reads as none", () => {
    expect(readFindingDetail(undefined)).toBeNull();
    expect(readFindingDetail({})).toBeNull();
    expect(readFindingDetail({ finding: "measurement" })).toBeNull();
    expect(readFindingDetail({ finding: { kind: "measurement", value: "12", unit: "px" } })).toBeNull();
    expect(readFindingDetail({ finding: { kind: "measurement", value: 1, unit: "px", uncertainty: -1 } })).toBeNull();
    expect(readFindingDetail({ finding: { kind: "location", lat: 95, lon: 0 } })).toBeNull();
    expect(readFindingDetail({ finding: { kind: "location", lat: NaN, lon: 0 } })).toBeNull();
    expect(readFindingDetail({ finding: { kind: "decode", scheme: "DTMF" } })).toBeNull();
    expect(readFindingDetail({ finding: { kind: "teleport" } })).toBeNull();
  });
});
