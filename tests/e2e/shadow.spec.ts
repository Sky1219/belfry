import { expect, test, type Page } from "@playwright/test";
import { exifSegment, tiff } from "../unit/helpers/imageBytes";
import { collectErrors, skipDemo } from "./helpers";

const LIMIT =
  "Assumes a vertical object on level ground, seen without strong perspective. Any place on this circle saw the sun at this height at that moment.";

async function openCaseBoard(page: Page, title: string) {
  await skipDemo(page);
  await page.goto("./");
  await page.getByTestId("new-case-title").fill(title);
  await page.getByTestId("create-case").click();
  await expect(page.getByTestId("board")).toBeVisible();
}

/** Opens the tool from the rack and runs the demo shadow; resolves once the fix has read out. */
async function runDemo(page: Page) {
  await page.getByTestId("open-tool-shadow-geolocation").click();
  await expect(page.getByTestId("no-signal")).toBeVisible();
  await page.getByTestId("run-demo").click();
  await expect(page.getByTestId("panel-fix")).toContainText(/5[01]\.\d° N/, { timeout: 10_000 });
}

test("demo: pre-filled marks give a fix near London that pins as a location", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openCaseBoard(page, "Lamp Post Case");

  // one tool key is the next step, not every one (The Next Step Rule), with the fifth tool registered
  const toolKeys = page.getByRole("group", { name: "Tools" }).locator(".hud-btn");
  await expect(toolKeys.nth(4)).toBeVisible();
  await expect(toolKeys.and(page.locator(".active"))).toHaveCount(1);
  // at this width the unlit tool keys are icons, but each is still named (Ruling P4-R5)
  const shadowKey = page.getByTestId("open-tool-shadow-geolocation");
  await expect(shadowKey.locator(".btn-text")).toHaveCSS("position", "absolute");
  await expect(shadowKey).toHaveAccessibleName("Shadow geolocation");
  await expect(toolKeys.and(page.locator(".active")).locator(".btn-text")).toBeVisible();

  await runDemo(page);
  const fix = page.getByTestId("panel-fix");
  await expect(fix).toContainText(/5[01]\.\d° N/);
  await expect(fix).toContainText(/0\.\d° W/);
  await expect(fix).toContainText(LIMIT);
  // the one-place radius states what it assumes (Ruling P4-R3)
  await expect(fix).toContainText("That radius assumes the bearing is right to within 2° and the camera clock is right.");
  await expect(page.getByTestId("result-fix")).toHaveAttribute("aria-live", "polite");
  expect(await page.locator("body").innerText()).not.toMatch(/NaN|Infinity|undefined/);

  // the demo's fields come pre-filled from its staged truth
  await expect(page.getByTestId("shadow-date")).toHaveValue("2026-06-21");
  await expect(page.getByTestId("shadow-time")).toHaveValue(/^14:00/);
  await expect(page.getByTestId("shadow-offset")).toHaveValue("+00:00");
  await expect(page.getByTestId("shadow-bearing")).not.toHaveValue("");

  // the graticule draws the fix in amber, and the latitude table carries it as text
  const map = fix.getByTestId("shadow-graticule");
  await expect(map).toHaveAttribute("role", "img");
  const amberPixels = await map.evaluate((c) => {
    const canvas = c as HTMLCanvasElement;
    const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 235 && data[i + 1] > 145 && data[i + 1] < 190 && data[i + 2] < 90) n++;
    return n;
  });
  expect(amberPixels).toBeGreaterThan(100);
  const table = fix.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["Latitude", "Longitudes on the circle"]);
  await expect(table.getByRole("rowheader")).toHaveCount(11);

  // marks are keys: arrow keys nudge the focused one a pixel at a time, and focus stays on it
  const tip = page.getByTestId("mark-tip");
  await expect(page.getByTestId("mark-base")).toBeVisible();
  await expect(page.getByTestId("mark-top")).toBeVisible();
  const before = await tip.getAttribute("aria-label");
  await tip.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tip).toBeFocused();
  await expect(tip).not.toHaveAttribute("aria-label", before!);
  await page.keyboard.press("ArrowLeft");
  await expect(tip).toHaveAttribute("aria-label", before!);
  await expect(fix).toContainText(/0\.\d° W/);

  // while a change waits to be solved, the shown fix is dimmed and can't be pinned (Ruling P4-R7)
  const result = fix.getByTestId("shadow-result");
  await expect(result).toHaveAttribute("data-stale", "false");
  const midway = await page.evaluate(async () => {
    const mark = document.querySelector('[data-testid="mark-tip"]')!;
    mark.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
    const pin = document.querySelector<HTMLButtonElement>('[data-testid="pin-fix"]')!;
    return { pinDisabled: pin.disabled, stale: document.querySelector<HTMLElement>('[data-testid="shadow-result"]')!.dataset.stale };
  });
  expect(midway).toEqual({ pinDisabled: true, stale: "true" });
  await expect(result).toHaveAttribute("data-stale", "false");
  await expect(page.getByTestId("pin-fix")).toBeEnabled();
  await tip.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tip).toHaveAttribute("aria-label", before!);
  await expect(result).toHaveAttribute("data-stale", "false");

  await page.getByTestId("pin-fix").click();
  await expect(fix).toContainText("Pinned");
  await page.getByTestId("tool-close").click();

  // the demo photo, the map (→ photo) and the finding (→ map)
  await expect(page.getByTestId("board")).toBeVisible();
  const cards = page.locator(".react-flow__node");
  await expect(cards).toHaveCount(3);
  await expect(page.locator(".react-flow__edge.link-derived-from")).toHaveCount(2);
  const finding = cards.filter({ hasText: "Shadow fix:" });
  await expect(finding.getByTestId("finding-readout")).toContainText("° N");

  expect(errors()).toEqual([]);
});

test("without an offset the tool asks for one", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openCaseBoard(page, "Unknown Zone Case");
  await runDemo(page);

  await page.getByTestId("shadow-offset").fill("");
  const fix = page.getByTestId("panel-fix");
  await expect(fix).toContainText("Enter the UTC offset");
  await expect(fix).not.toContainText("° N");
  // a refusal is not a finding: no map and no pin (Two Lights)
  await expect(fix.getByTestId("shadow-graticule")).toHaveCount(0);
  await expect(page.getByTestId("pin-fix")).toHaveCount(0);

  // a loosely typed offset is read as meant, and the fix returns
  await page.getByTestId("shadow-offset").fill("+0");
  await expect(fix).toContainText(/0\.\d° W/);

  // a bearing typed as -30 reads as 330 (Review Focus 4), and a cleared bearing gives the circle of places
  const verdict = page.getByTestId("shadow-verdict");
  await page.getByTestId("shadow-bearing").fill("330");
  await expect(verdict).not.toContainText("0.1° W");
  const at330 = await verdict.innerText();
  await page.getByTestId("shadow-bearing").fill("-30");
  await expect(verdict).toHaveText(at330);
  await page.getByTestId("shadow-bearing").fill("");
  await expect(fix).toContainText("Circle of places");
  await expect(fix).toContainText(LIMIT);

  expect(errors()).toEqual([]);
});

/**
 * A 320 x 240 phone-style JPEG made in the page, with an EXIF block carrying the local time it was
 * taken but no UTC offset, as most cameras write it (Review Focus 1).
 */
async function phoneJpegWithoutOffset(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 240;
    const g = c.getContext("2d")!;
    g.fillStyle = "#8fb4dc";
    g.fillRect(0, 0, 320, 120);
    g.fillStyle = "#a9a49a";
    g.fillRect(0, 120, 320, 120);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  const plain = Buffer.from(b64, "base64");
  const app1 = exifSegment(tiff("II", { exif: [{ tag: 0x9003, type: 2, value: "2026:06:21 15:00:00" }] }));
  const len = app1.body.length + 2;
  // the EXIF segment goes straight after the JPEG's start-of-image marker
  return Buffer.concat([plain.subarray(0, 2), Buffer.from([0xff, app1.marker, len >> 8, len & 0xff]), Buffer.from(app1.body), plain.subarray(2)]);
}

test("a photo with a local time but no offset: place the marks, then give the offset", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await openCaseBoard(page, "Street Corner Case");

  await page.getByTestId("open-tool-shadow-geolocation").click();
  await expect(page.getByTestId("no-signal")).toBeVisible();
  await page.getByTestId("no-signal-file-input").setInputFiles({ name: "street.jpg", mimeType: "image/jpeg", buffer: await phoneJpegWithoutOffset(page) });

  // the camera's clock reading fills in; the offset it didn't record is asked for, never guessed
  await expect(page.getByTestId("shadow-date")).toHaveValue("2026-06-21", { timeout: 20_000 });
  await expect(page.getByTestId("shadow-time")).toHaveValue("15:00:00");
  await expect(page.getByTestId("shadow-offset")).toHaveValue("");
  await expect(page.getByTestId("panel-inputs")).toContainText("The camera recorded no UTC offset");
  await expect(page.getByTestId("panel-inputs")).toContainText("Required");

  // parked marks are not a measurement
  const fix = page.getByTestId("panel-fix");
  await expect(fix).toContainText("Mark the object's base, its top and the tip of its shadow.");
  await expect(fix).toContainText("Still to place: BASE, TOP and TIP.");
  await expect(fix.getByTestId("shadow-graticule")).toHaveCount(0);
  for (const [mark, key] of [
    ["base", "ArrowDown"],
    ["top", "ArrowUp"],
    ["tip", "ArrowRight"],
  ] as const) {
    await page.getByTestId(`mark-${mark}`).focus();
    await page.keyboard.press(key);
  }
  await expect(fix).toContainText("Enter the UTC offset the photo was taken in: the same clock time is a different sun in every zone.");
  await expect(fix).not.toContainText("° N");
  await expect(page.getByTestId("pin-fix")).toHaveCount(0);

  // with the offset, the sun's height and its circle of places
  await page.getByTestId("shadow-offset").fill("+1");
  await expect(fix).toContainText("Sun elevation:");
  await expect(fix).toContainText("Circle of places");
  await expect(page.getByTestId("panel-inputs")).not.toContainText("Required");
  expect(await page.locator("body").innerText()).not.toMatch(/NaN|Infinity|undefined/);

  expect(errors()).toEqual([]);
});

test("at phone width five tools don't widen the page", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await openCaseBoard(page, "Pocket Case");
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  // the rail's action row scrolls inside itself (Ruling P4-R5), and its last tool key is still reachable
  expect(await fits()).toBe(true);
  const shadowKey = page.getByTestId("open-tool-shadow-geolocation");
  await expect(shadowKey).toHaveAccessibleName("Shadow geolocation");
  await shadowKey.scrollIntoViewIfNeeded();
  expect(await fits()).toBe(true);
  await shadowKey.click();
  await page.getByTestId("run-demo").click();
  await expect(page.getByTestId("panel-fix")).toContainText(/5[01]\.\d° N/, { timeout: 10_000 });
  expect(await fits()).toBe(true);

  expect(errors()).toEqual([]);
});
