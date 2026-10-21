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

export interface NavigateOptions {
  /** Replace the current history entry instead of pushing one, so Back skips the route being left. */
  replace?: boolean;
}

export type Navigate = (r: Route, opts?: NavigateOptions) => void;

export function useRoute(): [Route, Navigate] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = useCallback<Navigate>((r, opts) => {
    // a hash-only replace still fires hashchange, so the route updates either way
    if (opts?.replace) window.location.replace(formatRoute(r));
    else window.location.hash = formatRoute(r);
  }, []);
  return [route, navigate];
}
