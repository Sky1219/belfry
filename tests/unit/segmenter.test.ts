import { describe, expect, test } from "vitest";
import { personMaskIndex } from "../../src/tools/detective/models/maskIndex";

describe("personMaskIndex", () => {
  test("uses the label that names the person", () => {
    expect(personMaskIndex(["background", "person"], 2)).toBe(1);
    expect(personMaskIndex(["person", "background"], 2)).toBe(0);
    expect(personMaskIndex(["background", "selfie"], 2)).toBe(1);
  });

  test("falls back to index 1 of two masks (selfie segmenter: background=0, person=1)", () => {
    expect(personMaskIndex([], 2)).toBe(1);
    expect(personMaskIndex(["a", "b"], 2)).toBe(1);
  });

  test("a single mask is the person", () => {
    expect(personMaskIndex([], 1)).toBe(0);
  });
});
