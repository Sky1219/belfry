import { expect, test, type Page } from "@playwright/test";
import { collectErrors } from "./helpers";

async function addNote(page: Page, title: string) {
  await page.getByTestId("add-note").click();
  await page.getByTestId("note-title").fill(title);
  await page.getByTestId("save-note").click();
  await expect(page.locator(".react-flow__node", { hasText: title })).toBeVisible();
}

const transformOf = (page: Page, title: string) =>
  page.locator(".react-flow__node", { hasText: title }).evaluate((el) => (el as HTMLElement).style.transform);

test("case board: notes, links, dragging, search, export/import", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("./");

  // create a case and open it
  await page.getByTestId("new-case-title").fill("Test Case");
  await page.getByTestId("create-case").click();
  await page.getByTestId("case-row").filter({ hasText: "Test Case" }).getByTestId("open-case").click();
  await expect(page.getByTestId("board")).toBeVisible();

  await addNote(page, "Muddy boot print");
  await addNote(page, "Torn receipt");

  // connect the first note to the second
  const a = page.locator(".react-flow__node", { hasText: "Muddy boot print" });
  const b = page.locator(".react-flow__node", { hasText: "Torn receipt" });
  await a.locator(".react-flow__handle.source").dragTo(b.locator(".react-flow__handle.target"));
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  // drag the second note somewhere new
  const before = await transformOf(page, "Torn receipt");
  const box = (await b.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 180, box.y + 140, { steps: 8 });
  await page.mouse.up();
  const after = await transformOf(page, "Torn receipt");
  expect(after).not.toBe(before);

  // everything persists across a reload
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.locator(".react-flow__node", { hasText: "Muddy boot print" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "Torn receipt" })).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  expect(await transformOf(page, "Torn receipt")).toBe(after);

  // sidebar search
  await page.getByTestId("evidence-search").fill("receipt");
  await expect(page.getByTestId("sidebar-item")).toHaveCount(1);
  await expect(page.getByTestId("sidebar-item")).toHaveText(/Torn receipt/);
  await page.getByTestId("evidence-search").fill("");

  // export, delete, import
  await page.getByTestId("back-to-cases").click();
  const row = page.getByTestId("case-row").filter({ hasText: "Test Case" });
  const [download] = await Promise.all([page.waitForEvent("download"), row.getByTestId("export-case").click()]);
  expect(download.suggestedFilename()).toMatch(/\.belfry$/);
  const path = await download.path();

  await row.getByTestId("delete-case").click();
  await page.getByTestId("confirm-yes").click();
  await expect(page.getByTestId("case-row")).toHaveCount(0);

  await page.getByTestId("import-file").setInputFiles(path!);
  await expect(page.getByTestId("case-row").filter({ hasText: "Test Case" })).toHaveCount(1);
  await page.getByTestId("case-row").filter({ hasText: "Test Case" }).getByTestId("open-case").click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  expect(errors()).toEqual([]);
});
