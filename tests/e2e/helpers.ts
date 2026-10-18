import type { Page } from "@playwright/test";

/** Records page errors and console errors, ignoring third-party fetch failures
 * (fonts, model CDNs) that the sandboxed test environment cannot reach. */
export function collectErrors(page: Page): () => string[] {
  const errors: string[] = [];
  const ignorable = /Failed to load resource|ERR_TUNNEL_CONNECTION_FAILED|fonts\.googleapis|ERR_NAME_NOT_RESOLVED/;
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !ignorable.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return () => errors;
}
