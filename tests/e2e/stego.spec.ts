import { expect, test, type Page } from "@playwright/test";
import { collectErrors, skipDemo } from "./helpers";

const DEMO_MESSAGE = "The bell was stopped at 04:10 from the east bracket.";
const LIMIT = "Only detects sequential LSB embedding. Absence of a signal isn't proof of a clean image.";
const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

async function openCaseBoard(page: Page, title: string) {
  await skipDemo(page);
  await page.goto("./");
  await page.getByTestId("new-case-title").fill(title);
  await page.getByTestId("create-case").click();
  await expect(page.getByTestId("board")).toBeVisible();
}

/** Opens the lab from the rack and runs the demo image; resolves once the analysis has read out. */
async function runDemo(page: Page) {
  await page.getByTestId("open-tool-stego-lab").click();
  await expect(page.getByTestId("no-signal")).toBeVisible();
  await page.getByTestId("run-demo").click();
  await expect(page.getByTestId("panel-analyse")).toContainText("LSB payload found", { timeout: 30_000 });
}

/** A 64 × 64 noisy JPEG, made in the page: 4096 opaque pixels hold 1528 message bytes. */
async function noisyJpeg(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const img = g.createImageData(64, 64);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 100 + ((i * 7919) % 61);
      img.data.set([v, v + 10, v + 20, 255], i);
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  return Buffer.from(b64, "base64");
}

test("demo image: the hidden message is found and pinned as a decode", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openCaseBoard(page, "Harbour Case");

  // with no tool opened yet, one tool key is the next step, not every one (The Next Step Rule)
  const toolKeys = page.getByRole("group", { name: "Tools" }).locator(".hud-btn");
  await expect(toolKeys.nth(2)).toBeVisible();
  await expect(toolKeys.and(page.locator(".active"))).toHaveCount(1);

  await runDemo(page);
  const analyse = page.getByTestId("panel-analyse");
  await expect(analyse).toContainText("Hidden data: LSB payload found");
  await expect(analyse).toContainText(DEMO_MESSAGE);
  await expect(analyse).toContainText(LIMIT);
  await expect(analyse).not.toContainText(/proves|proof that|confirmed|guarantee/i);
  await expect(page.getByTestId("result-analyse")).toHaveAttribute("aria-live", "polite");

  // ten bars, k = 10% … 100%, each with its 2 dp value in its label and on the glass; amber on a payload
  const bars = analyse.getByTestId("chi-bar");
  await expect(bars).toHaveCount(10);
  await expect(bars.first()).toHaveAttribute("aria-label", /^10% read: p [01]\.\d\d$/);
  await expect(bars.last()).toHaveAttribute("aria-label", /^100% read: p [01]\.\d\d$/);
  await expect(analyse.getByTestId("chi-value")).toHaveCount(10);
  await expect(analyse.getByTestId("chi-value").first()).toHaveText(/^[01]\.\d\d$/);
  await expect(analyse.getByTestId("chi-chart")).toHaveAttribute("data-lit", "true");

  await page.getByTestId("pin-analyse").click();
  await expect(analyse).toContainText("Pinned");
  await page.getByTestId("tool-close").click();

  await expect(page.getByTestId("board")).toBeVisible();
  const cards = page.locator(".react-flow__node");
  await expect(cards).toHaveCount(2);
  await expect(page.locator(".react-flow__edge.link-derived-from")).toHaveCount(1);
  const finding = cards.filter({ hasText: "Hidden data: LSB payload found" });
  await expect(finding.getByTestId("finding-readout")).toHaveText(`LSB · ${DEMO_MESSAGE}`);

  expect(errors()).toEqual([]);
});

test("embedding writes a PNG derived from the source, and it reads back", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openCaseBoard(page, "Dead Drop Case");
  await runDemo(page);

  await page.getByTestId("mode-embed").click();
  await expect(page.getByTestId("mode-embed")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("panel-analyse")).toHaveCount(0);
  const embed = page.getByTestId("panel-embed");
  // the demo is a PNG, so there is no JPEG warning
  await expect(embed).not.toContainText("Saved as PNG");
  await page.getByTestId("embed-message").fill("Meet at the belfry");
  await expect(page.getByTestId("embed-capacity")).toHaveText("18 of 73720 bytes");
  await page.getByTestId("embed-pin").click();
  await expect(embed).toContainText("Pinned", { timeout: 20_000 });
  await page.getByTestId("tool-close").click();

  // the demo, the new image (→ demo) and its finding (→ image)
  await expect(page.getByTestId("board")).toBeVisible();
  const cards = page.locator(".react-flow__node");
  await expect(cards).toHaveCount(3);
  await expect(page.locator(".react-flow__edge.link-derived-from")).toHaveCount(2);
  const image = cards.filter({ hasText: "Demo image — harbour — with hidden message" });
  await expect(image).toHaveCount(1);
  const finding = cards.filter({ hasText: "Message hidden (LSB, 18 bytes)" });
  await expect(finding).toContainText("Share the PNG itself; re-saving it as JPEG destroys the message.");

  // the board loop: the new exhibit, sent back to the lab, reads its message out
  await image.getByTestId("card-menu").click();
  await page.getByTestId("send-to-stego-lab").click();
  await expect(page.getByTestId("panel-analyse")).toContainText("LSB payload found", { timeout: 30_000 });
  await expect(page.getByTestId("panel-analyse")).toContainText("Meet at the belfry");
  await expect(page.getByTestId("panel-analyse")).not.toContainText(DEMO_MESSAGE);

  expect(errors()).toEqual([]);
});

test("a JPEG source warns before embedding, and over capacity says so exactly", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openCaseBoard(page, "Postcard Case");

  await page.getByTestId("open-tool-stego-lab").click();
  await expect(page.getByTestId("no-signal")).toBeVisible();
  await page.getByTestId("no-signal-file-input").setInputFiles({ name: "postcard.jpg", mimeType: "image/jpeg", buffer: await noisyJpeg(page) });
  await expect(page.getByTestId("panel-analyse")).toContainText("Hidden data:", { timeout: 30_000 });
  await expect(page.getByTestId("panel-analyse")).not.toContainText("Working");

  await page.getByTestId("mode-embed").click();
  const embed = page.getByTestId("panel-embed");
  await expect(embed).toContainText("Saved as PNG: a JPEG save would erase the message.");
  await page.getByTestId("embed-message").fill("x".repeat(1528));
  await expect(page.getByTestId("embed-capacity")).toHaveText("1528 of 1528 bytes");
  await expect(page.getByTestId("embed-pin")).toBeEnabled();
  await page.getByTestId("embed-message").fill("x".repeat(1529));
  await expect(page.getByTestId("embed-capacity")).toHaveText("1529 of 1528 bytes");
  await expect(page.getByTestId("embed-capacity")).toHaveClass(/over/);
  await expect(embed.getByRole("alert")).toHaveText("That message needs 1537 bytes; this image holds 1528.");
  await expect(page.getByTestId("embed-pin")).toBeDisabled();

  // switching modes keeps the message and doesn't re-run the analysis
  await page.getByTestId("mode-analyse").click();
  await expect(page.getByTestId("panel-analyse")).toContainText("Hidden data:");
  await page.getByTestId("mode-embed").click();
  await expect(page.getByTestId("embed-message")).toHaveValue("x".repeat(1529));

  expect(errors()).toEqual([]);
});

test("a one-pixel image is too small to hold a message", async ({ page }) => {
  const errors = collectErrors(page);
  await openCaseBoard(page, "Speck Case");

  await page.getByTestId("open-tool-stego-lab").click();
  await page.getByTestId("no-signal-file-input").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: Buffer.from(ONE_PIXEL_PNG, "base64") });
  await expect(page.getByTestId("panel-analyse")).toContainText("Hidden data:", { timeout: 30_000 });
  await expect(page.getByTestId("chi-bar")).toHaveCount(10);
  expect(await page.locator("body").innerText()).not.toContain("NaN");

  await page.getByTestId("mode-embed").click();
  await expect(page.getByTestId("panel-embed")).toContainText("This image is too small to hold a message.");
  await expect(page.getByTestId("panel-embed")).not.toContainText("needs 8 bytes");
  await expect(page.getByTestId("embed-message")).toHaveCount(0);

  expect(errors()).toEqual([]);
});
