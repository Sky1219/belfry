import { expect, test, type Page } from "@playwright/test";
import { collectErrors, skipDemo } from "./helpers";

const NOTICE = "Compare your own prints only. Prints are processed on this device and never leave it. This is not an identification.";
const LIMIT = "Hobby-grade matching of two photos. This is not an identification.";

async function openCaseBoard(page: Page, title: string) {
  await skipDemo(page);
  await page.goto("./");
  await page.getByTestId("new-case-title").fill(title);
  await page.getByTestId("create-case").click();
  await expect(page.getByTestId("board")).toBeVisible();
}

/** Opens the lab from the rack, runs the demo prints and acknowledges the notice. */
async function runDemoPrints(page: Page) {
  await page.getByTestId("open-tool-fingerprint-lab").click();
  await expect(page.getByTestId("no-signal")).toBeVisible();
  await page.getByTestId("run-demo").click();
  await expect(page.getByTestId("fp-notice")).toContainText(NOTICE, { timeout: 20_000 });
  await page.getByTestId("fp-notice-ack").click();
}

test("notice once, demo prints match, result pins with an overlay", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openCaseBoard(page, "Two Prints Case");

  await page.getByTestId("open-tool-fingerprint-lab").click();
  await expect(page.getByTestId("no-signal")).toBeVisible();
  await page.getByTestId("run-demo").click();

  // the notice gates the analysis (Ruling P2-R1): nothing is compared until it is acknowledged
  const notice = page.getByTestId("fp-notice");
  await expect(notice).toContainText(NOTICE, { timeout: 20_000 });
  await expect(page.getByTestId("fp-notice-ack")).toHaveText("I'm comparing my own prints");
  await expect(page.getByTestId("panel-match")).toHaveCount(0);
  await page.getByTestId("fp-notice-ack").click();
  await expect(notice).toHaveCount(0);

  // print B comes from the demo's pairing, without asking
  await expect(page.getByTestId("panel-print-b")).toContainText("Demo print B");
  const match = page.getByTestId("panel-match");
  await expect(match).toContainText("Fingerprint match: consistent with the same finger", { timeout: 30_000 });
  await expect(match).toContainText(LIMIT);
  await expect(match).not.toContainText(/identified|match confirmed|proves/i);
  await expect(match.locator("canvas")).toBeVisible();

  await page.getByTestId("pin-match").click();
  await expect(match).toContainText("Pinned");
  await page.getByTestId("tool-close").click();

  // prints A and B, the comparison and the finding: comparison → A, finding → comparison, finding → B
  await expect(page.getByTestId("board")).toBeVisible();
  const cards = page.locator(".react-flow__node");
  await expect(cards).toHaveCount(4);
  await expect(page.locator(".react-flow__edge.link-derived-from")).toHaveCount(3);
  const finding = cards.filter({ hasText: "Fingerprint match: consistent with the same finger" });
  await expect(finding.getByTestId("finding-readout")).toHaveText(/^0\.\d\d match score$/);

  // reopened on print A after a reload, the lab goes straight to the match: the notice shows once per browser (Review Focus 4)
  await page.reload();
  await expect(page.getByTestId("board")).toBeVisible();
  await cards.filter({ hasText: "Demo print A" }).getByTestId("card-menu").click();
  await page.getByTestId("send-to-fingerprint-lab").click();
  await expect(page.getByTestId("panel-match")).toContainText("consistent with the same finger", { timeout: 30_000 });
  await expect(page.getByTestId("fp-notice")).toHaveCount(0);

  expect(errors()).toEqual([]);
});

test("the second-print picker never offers the first print", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openCaseBoard(page, "Picker Case");
  await runDemoPrints(page);
  await expect(page).toHaveURL(/\/tool\/fingerprint-lab\/ev%3A/);
  const printA = page.url();
  await page.getByTestId("tool-close").click();
  await expect(page.getByTestId("board")).toBeVisible();

  // open the lab on demo print A by its ev: route
  await page.goto(printA);
  await expect(page.getByTestId("panel-print-b")).toContainText("Demo print B", { timeout: 20_000 });
  await page.getByTestId("fp-change-b").click();

  // the picker lists print B but never print A itself (Review Focus 2)
  const picker = page.getByTestId("exhibit-picker");
  await expect(picker).toBeVisible();
  const items = picker.getByTestId("exhibit-picker-item");
  await expect(items.filter({ hasText: "Demo print B" })).toHaveCount(1);
  await expect(items.filter({ hasText: "Demo print A" })).toHaveCount(0);

  expect(errors()).toEqual([]);
});
