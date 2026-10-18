import { expect, test } from "@playwright/test";
import { collectErrors, skipDemo } from "./helpers";

test("app loads with the Belfry title and no console errors", async ({ page }) => {
  const errors = collectErrors(page);
  await skipDemo(page);
  await page.goto("./");
  await expect(page).toHaveTitle("Belfry");
  await expect(page.getByText("BELFRY", { exact: true })).toBeVisible();
  expect(errors()).toEqual([]);
});
