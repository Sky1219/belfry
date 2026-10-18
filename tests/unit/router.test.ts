import { describe, expect, test } from "vitest";
import { formatRoute, parseRoute, type Route } from "../../src/app/router";

describe("router", () => {
  test("parses and formats every route", () => {
    const routes: Route[] = [
      { name: "cases" },
      { name: "board", caseId: "01J0ABC" },
      { name: "tool", caseId: "01J0ABC", toolId: "detective-vision", input: "live-camera" },
      { name: "tool", caseId: "01J0ABC", toolId: "detective-vision", input: "ev:01J0XYZ" },
    ];
    for (const r of routes) expect(parseRoute(formatRoute(r))).toEqual(r);
  });

  test("unknown or empty hash falls back to cases", () => {
    expect(parseRoute("")).toEqual({ name: "cases" });
    expect(parseRoute("#/nonsense/x")).toEqual({ name: "cases" });
  });
});
