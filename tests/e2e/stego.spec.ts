import { readFile } from "node:fs/promises";
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

/** A 64 × 64 noisy JPEG (or WebP), made in the page: 4096 opaque pixels hold 1528 message bytes. */
async function noisyJpeg(page: Page, type = "image/jpeg"): Promise<Buffer> {
  const b64 = await page.evaluate((type) => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const img = g.createImageData(64, 64);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 100 + ((i * 7919) % 61);
      img.data.set([v, v + 10, v + 20, 255], i);
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL(type, 0.9).split(",")[1];
  }, type);
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

  // the demo's first 60% of low bits are random (Ruling P3-R11): those bars read embedded and burn amber, the rest stay steel
  for (let i = 0; i < 6; i++) await expect(bars.nth(i)).toHaveAttribute("aria-label", /p (0\.9[5-9]|1\.00)$/);
  for (let i = 6; i < 10; i++) await expect(bars.nth(i)).toHaveAttribute("aria-label", /p 0\.([0-8]\d|9[0-4])$/);
  const fill = (i: number) => bars.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor);
  const amber = await fill(0);
  expect(await fill(5)).toBe(amber);
  expect(await fill(6)).not.toBe(amber);
  expect(await fill(9)).toBe(await fill(6));
  await expect(analyse.getByTestId("chi-chart")).toContainText("The first 60% of the low bits read embedded; the message itself fills under 1%.");

  await page.getByTestId("pin-analyse").click();
  await expect(analyse).toContainText("Pinned");
  await page.getByTestId("tool-close").click();

  await expect(page.getByTestId("board")).toBeVisible();
  const cards = page.locator(".react-flow__node");
  await expect(cards).toHaveCount(2);
  await expect(page.locator(".react-flow__edge.link-derived-from")).toHaveCount(1);
  const finding = cards.filter({ hasText: "Hidden data: LSB payload found" });
  await expect(finding.getByTestId("finding-readout")).toHaveText(`LSB · ${DEMO_MESSAGE}`);
  // a long decode can't take over the card: the readout is clamped to 4 lines (Ruling P3-R9)
  await expect(finding.getByTestId("finding-readout")).toHaveCSS("-webkit-line-clamp", "4");

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
  await expect(embed).toContainText("Anyone who knows to look can read it; it isn't encrypted.");
  await expect(page.getByTestId("embed-download")).toHaveCount(0);
  await page.getByTestId("embed-pin").click();
  await expect(embed).toContainText("Pinned", { timeout: 20_000 });

  // the PNG's way out: Download PNG is now the lit next step, and saves the exact PNG (Ruling P3-R7)
  const download = page.getByTestId("embed-download");
  await expect(download).toHaveText("Download PNG");
  await expect(download).toHaveClass(/active/);
  await expect(page.getByTestId("embed-pin")).not.toHaveClass(/active/);
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(file.suggestedFilename()).toBe("demo-image-harbour-with-hidden-message.png");
  const saved = await readFile((await file.path())!);
  expect([...saved.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // editing the message makes hiding it the next step again
  await page.getByTestId("embed-message").fill("Meet at the belfry at ten");
  await expect(page.getByTestId("embed-pin")).toHaveClass(/active/);
  await expect(download).not.toHaveClass(/active/);
  await page.getByTestId("embed-message").fill("Meet at the belfry");
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
  // both sides count the 8-byte header, so the error's overage matches the counter's (Ruling P3-R5)
  await expect(embed.getByRole("alert")).toHaveText("That message needs 1537 bytes; this image holds 1536.");
  await expect(page.getByTestId("embed-pin")).toBeDisabled();

  // switching modes keeps the typed message
  await page.getByTestId("mode-analyse").click();
  await expect(page.getByTestId("panel-analyse")).toContainText("Hidden data:");
  await page.getByTestId("mode-embed").click();
  await expect(page.getByTestId("embed-message")).toHaveValue("x".repeat(1529));

  // embed from the JPEG for real: decoded JPEG → embed → canvas PNG → stored → decoded again (Review Focus 2)
  const secret = "Under the east bracket, café 23:00";
  await page.getByTestId("embed-message").fill(secret);
  await page.getByTestId("embed-pin").click();
  await expect(embed).toContainText("Pinned", { timeout: 20_000 });
  await page.getByTestId("tool-close").click();
  await expect(page.getByTestId("board")).toBeVisible();
  const image = page.locator(".react-flow__node").filter({ hasText: "— with hidden message" });
  await expect(image).toHaveCount(1);

  // the stored exhibit is a PNG, by its recorded type and by its own signature bytes
  const stored = await page.evaluate(
    () =>
      new Promise<{ mime: string; signature: number[] } | null>((resolve, reject) => {
        const open = indexedDB.open("belfry");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(["evidence", "blobs"], "readonly");
          const all = tx.objectStore("evidence").getAll();
          all.onsuccess = () => {
            const ev = (all.result as Array<{ title: string; blobHash?: string }>).find((e) => e.title.endsWith("— with hidden message"));
            if (!ev?.blobHash) return resolve(null);
            const blob = tx.objectStore("blobs").get(ev.blobHash);
            blob.onsuccess = () => {
              const b = blob.result as { mime: string; bytes: Uint8Array };
              resolve({ mime: b.mime, signature: Array.from(b.bytes.slice(0, 8)) });
            };
          };
        };
      }),
  );
  expect(stored).toEqual({ mime: "image/png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] });

  // and the lab reads the message back from the new card
  await image.getByTestId("card-menu").click();
  await page.getByTestId("send-to-stego-lab").click();
  await expect(page.getByTestId("panel-analyse")).toContainText("LSB payload found", { timeout: 30_000 });
  await expect(page.getByTestId("panel-analyse")).toContainText(secret);

  expect(errors()).toEqual([]);
});

test("a WebP source warns, and a browser that changes the picture while saving refuses to pin", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  // a canvas-noise defence, as Brave or Safari Private apply: once armed, every read-out nudges some low bits
  await page.addInitScript(() => {
    const read = OffscreenCanvasRenderingContext2D.prototype.getImageData;
    OffscreenCanvasRenderingContext2D.prototype.getImageData = function (...args: Parameters<typeof read>) {
      const img = read.apply(this, args);
      if ((globalThis as { canvasNoise?: boolean }).canvasNoise) for (let i = 0; i < 400; i += 4) img.data[i] ^= 1;
      return img;
    };
  });
  await openCaseBoard(page, "Sticker Case");

  await page.getByTestId("open-tool-stego-lab").click();
  await expect(page.getByTestId("no-signal")).toBeVisible();
  await page.getByTestId("no-signal-file-input").setInputFiles({ name: "sticker.webp", mimeType: "image/webp", buffer: await noisyJpeg(page, "image/webp") });
  await expect(page.getByTestId("panel-analyse")).toContainText("Hidden data:", { timeout: 30_000 });

  await page.getByTestId("mode-embed").click();
  const embed = page.getByTestId("panel-embed");
  await expect(embed).toContainText("Saved as PNG: a lossy WebP save would erase the message.");
  await expect(embed).not.toContainText("a JPEG save");

  await page.evaluate(() => ((globalThis as { canvasNoise?: boolean }).canvasNoise = true));
  await page.getByTestId("embed-message").fill("Under the east bracket");
  await page.getByTestId("embed-pin").click();
  await expect(embed.getByRole("alert")).toHaveText(
    "This browser changed the picture while saving it, so the message did not survive. Try another browser, or turn off fingerprinting protection for this page.",
    { timeout: 20_000 },
  );
  await expect(embed).not.toContainText("Pinned");
  await expect(page.getByTestId("embed-download")).toHaveCount(0);
  await page.getByTestId("tool-close").click();
  // only the source is on the board: nothing was pinned
  await expect(page.getByTestId("board")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);

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
