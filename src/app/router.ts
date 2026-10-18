import { useCallback, useEffect, useState } from "react";

export type Route =
  | { name: "cases" }
  | { name: "board"; caseId: string }
  | { name: "tool"; caseId: string; toolId: string; input: string };

const enc = encodeURIComponent;

export function formatRoute(r: Route): string {
  switch (r.name) {
    case "cases":
      return "#/";
    case "board":
      return `#/case/${enc(r.caseId)}`;
    case "tool":
      return `#/case/${enc(r.caseId)}/tool/${enc(r.toolId)}/${enc(r.input)}`;
  }
}

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "case" && parts.length === 2) return { name: "board", caseId: parts[1] };
  if (parts[0] === "case" && parts[2] === "tool" && parts.length === 5) {
    return { name: "tool", caseId: parts[1], toolId: parts[3], input: parts[4] };
  }
  return { name: "cases" };
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = useCallback((r: Route) => {
    window.location.hash = formatRoute(r);
  }, []);
  return [route, navigate];
}
