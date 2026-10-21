import { expect, test, type Locator, type Page } from "@playwright/test";
import { collectErrors, skipDemo } from "./helpers";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

async function openCaseBoard(page: Page, title: string) {
  await skipDemo(page);
  await page.goto("./");
  await page.getByTestId("new-case-title").fill(title);
  await page.getByTestId("create-case").click();
  await expect(page.getByTestId("board")).toBeVisible();
}

/** The intrinsic size of the panel's map canvas, which is what gets pinned. */
const canvasSize = (panel: Locator) =>
  panel.locator("canvas").evaluate((c) => ({ w: (c as HTMLCanvasElement).width, h: (c as HTMLCanvasElement).height }));

test("demo photo: every panel reads out, and pinned results link back to the photo", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openCaseBoard(page, "Bell Tower Case");

  await page.getByTestId("open-tool-photo-forensics").click();
  await expect(page.getByTestId("no-signal")).toBeVisible();
  await page.getByTestId("run-demo").click();

  await expect(page.getByTestId("panel-copy-move")).toContainText("consistent with cloned regions", { timeout: 20_000 });
  const jpeg = page.getByTestId("panel-jpeg");
  await expect(jpeg).toContainText(/about (89|90|91)/);
  // the demo is saved twice on the same grid (Ruling R8)
  await expect(jpeg).toContainText("consistent with two JPEG saves");

  // maps line up with the photo as decoded (Review Focus 2)
  for (const id of ["ela", "noise"]) {
    const panel = page.getByTestId(`panel-${id}`);
    await expect(panel.locator("canvas")).toBeVisible();
    expect(await canvasSize(panel)).toEqual({ w: 512, h: 384 });
  }

  await page.getByTestId("pin-copy-move").click();
  await expect(page.getByTestId("panel-copy-move")).toContainText("Pinned");
  await page.getByTestId("pin-ela").click();
  await expect(page.getByTestId("panel-ela")).toContainText("Pinned");
  await page.getByTestId("tool-close").click();

  // the demo photo, two maps and two findings, each derived from the one before
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect(page.locator(".react-flow__edge.link-derived-from")).toHaveCount(4);

  expect(errors()).toEqual([]);
});

test("a PNG says the JPEG tests don't apply and shows no NaN", async ({ page }) => {
  const errors = collectErrors(page);
  await openCaseBoard(page, "Screenshot Case");

  await page.getByTestId("open-tool-photo-forensics").click();
  await expect(page.getByTestId("no-signal")).toBeVisible();
  await page.getByTestId("no-signal-file-input").setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(ONE_PIXEL_PNG, "base64"),
  });

  await expect(page.getByTestId("panel-jpeg")).toContainText("Not a JPEG: quantization tests don't apply.", { timeout: 20_000 });
  await expect(page.getByTestId("panel-copy-move")).toContainText("inconclusive", { timeout: 20_000 });
  // every panel has finished before the page is read
  for (const id of ["metadata", "ela", "noise"]) {
    await expect(page.getByTestId(`panel-${id}`)).toBeVisible();
    await expect(page.getByTestId(`panel-${id}`)).not.toContainText("Working", { timeout: 20_000 });
  }
  expect(await page.locator("body").innerText()).not.toContain("NaN");

  expect(errors()).toEqual([]);
});
