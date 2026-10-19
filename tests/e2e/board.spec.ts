import { expect, test, type Page } from "@playwright/test";
import { collectErrors, skipDemo } from "./helpers";

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
  await skipDemo(page);
  await page.goto("./");

  // creating a case opens its board
  await page.getByTestId("new-case-title").fill("Test Case");
  await page.getByTestId("create-case").click();
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.getByTestId("board-empty")).toBeVisible();

  await addNote(page, "Muddy boot print");
  await addNote(page, "Torn receipt");
  await expect(page.getByTestId("board-empty")).toHaveCount(0);
  await expect(page.getByTestId("exhibit-tag").first()).toHaveText("EXH·001");

  // connect the first note to the second
  const a = page.locator(".react-flow__node", { hasText: "Muddy boot print" });
  const b = page.locator(".react-flow__node", { hasText: "Torn receipt" });
  await a.locator(".react-flow__handle.source").dragTo(b.locator(".react-flow__handle.target"));
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  // drag the second note somewhere new
  const before = await transformOf(page, "Torn receipt");
  const box = (await b.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 180, box.y + 170, { steps: 8 });
  await page.mouse.up();
  const after = await transformOf(page, "Torn receipt");
  expect(after).not.toBe(before);

  // everything persists across a reload
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator(".react-flow__node", { hasText: "Muddy boot print" })).toBeVisible();
  await expect(page.locator(".react-flow__node", { hasText: "Torn receipt" })).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  expect(await transformOf(page, "Torn receipt")).toBe(after);

  // sidebar search, with the filtered count
  await page.getByTestId("evidence-search").fill("receipt");
  await expect(page.getByTestId("sidebar-item")).toHaveCount(1);
  await expect(page.getByTestId("sidebar-item")).toHaveText(/Torn receipt/);
  await expect(page.getByTestId("evidence-count")).toHaveText(/1 of 2/);
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

test("removing evidence and links is undoable; keyboard moves are saved", async ({ page }) => {
  const errors = collectErrors(page);
  await skipDemo(page);
  await page.goto("./");
  await page.getByTestId("new-case-title").fill("Undo Case");
  await page.getByTestId("create-case").click();
  await addNote(page, "Ledger page");
  await addNote(page, "Ink blot");

  // link from the card menu (no dragging), then remove it from the link dialog and undo
  await page.locator(".react-flow__node", { hasText: "Ledger page" }).getByTestId("card-menu").click();
  await page.getByTestId("menu-link").click();
  await page.getByTestId("link-target").selectOption({ label: "EXH·002 Ink blot" });
  await page.getByTestId("save-link").click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await page.locator(".react-flow__edge").dblclick({ force: true });
  await page.getByTestId("remove-link").click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  await page.getByTestId("toast-action").click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  // the card menu answers Escape and returns focus to its button
  const menuBtn = page.locator(".react-flow__node", { hasText: "Ink blot" }).getByTestId("card-menu");
  await menuBtn.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(menuBtn).toBeFocused();

  // remove a card (the dialog lands on Cancel), then undo
  await menuBtn.click();
  await page.getByTestId("menu-delete").click();
  await expect(page.getByTestId("confirm-no")).toBeFocused();
  await page.getByTestId("confirm-yes").click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  await page.getByTestId("toast-action").click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  // move a card with the keyboard; it stays moved after a reload
  const node = page.locator(".react-flow__node", { hasText: "Ledger page" });
  await node.focus();
  await page.keyboard.press("Enter");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
  const moved = await transformOf(page, "Ledger page");
  await page.waitForTimeout(600);
  await page.reload();
  await expect(node).toBeVisible();
  expect(await transformOf(page, "Ledger page")).toBe(moved);

  // Escape closes Settings
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("settings")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings")).toHaveCount(0);

  expect(errors()).toEqual([]);
});

test("bulk tag and remove, undo for edits, case search", async ({ page }) => {
  const errors = collectErrors(page);
  await skipDemo(page);
  await page.goto("./");
  await page.getByTestId("new-case-title").fill("Bulk Case");
  await page.getByTestId("create-case").click();
  await addNote(page, "Coat button");
  await addNote(page, "Train ticket");
  await addNote(page, "Ash sample");

  // select two cards (Ctrl/Cmd-click), tag them together, then undo the tag
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.locator(".react-flow__node", { hasText: "Coat button" }).locator(".card-title").click();
  await page.locator(".react-flow__node", { hasText: "Train ticket" }).locator(".card-title").click({ modifiers: [mod] });
  await expect(page.getByTestId("bulk-bar")).toContainText("02 selected");
  await page.getByTestId("bulk-tag-open").click();
  await page.getByTestId("bulk-tag").fill("platform 9");
  await page.getByTestId("save-bulk-tag").click();
  await expect(page.locator(".react-flow__node", { hasText: "#platform-9" })).toHaveCount(2);
  await page.locator(".board-canvas").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press(`${mod}+z`);
  await expect(page.locator(".react-flow__node", { hasText: "#platform-9" })).toHaveCount(0);

  // bulk remove is one undoable step
  await page.locator(".react-flow__node", { hasText: "Coat button" }).locator(".card-title").click();
  await page.locator(".react-flow__node", { hasText: "Ash sample" }).locator(".card-title").click({ modifiers: [mod] });
  await page.getByTestId("bulk-remove").click();
  await page.getByTestId("confirm-yes").click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await page.getByTestId("toast-action").first().click();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);

  // an edit can be undone with the keyboard
  await page.locator(".react-flow__node", { hasText: "Ash sample" }).getByTestId("card-menu").click();
  await page.getByTestId("menu-edit").click();
  await page.getByTestId("edit-title").fill("Ash sample, cigar");
  await page.getByTestId("save-edit").click();
  await expect(page.locator(".react-flow__node", { hasText: "Ash sample, cigar" })).toHaveCount(1);
  await page.locator(".board-canvas").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press(`${mod}+z`);
  await expect(page.locator(".react-flow__node", { hasText: "Ash sample, cigar" })).toHaveCount(0);

  // case files search filters by name
  await page.getByTestId("back-to-cases").click();
  for (const name of ["Second", "Third", "Fourth"]) {
    await page.getByTestId("new-case-title").fill(name);
    await page.getByTestId("create-case").click();
    await page.getByTestId("back-to-cases").click();
  }
  await page.getByTestId("case-search").fill("bulk");
  await expect(page.getByTestId("case-row")).toHaveCount(1);
  expect(errors()).toEqual([]);
});

test("first visit opens the staged demo case", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("./");
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.locator(".case-name")).toHaveText("The Silent Bell");
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);

  // a returning visit goes to the case list, where the demo can be reopened
  await page.goto("./");
  await expect(page.getByTestId("case-row")).toHaveCount(1);
  await page.getByTestId("open-demo").click();
  await expect(page.locator(".case-name")).toHaveText("The Silent Bell");
  expect(errors()).toEqual([]);
});
