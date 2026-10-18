import { expect, test, type Page } from "@playwright/test";
import { collectErrors, skipDemo } from "./helpers";

const MODES = ["detective", "thermal", "night", "motion", "normal"];
const OVERLAYS = ["xray", "skeleton", "evidence", "vitals", "depthFog", "ghostTrails"];
const MODELS = ["segmentation", "detection", "depth"]; // what the Investigate preset needs

async function openCaseBoard(page: Page, title: string) {
  await skipDemo(page);
  await page.goto("./?mock");
  await page.getByTestId("new-case-title").fill(title);
  await page.getByTestId("create-case").click();
  await expect(page.getByTestId("board")).toBeVisible();
}

const card = (page: Page, type: string, text: string | RegExp) =>
  page.locator(`.react-flow__node:has([data-testid=evidence-card][data-type=${type}])`, { hasText: text });

test("Detective Vision: modes, overlays, scanning, capture, video input, persistence", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await openCaseBoard(page, "Mug Case");

  // open the tool on the live (fake) camera; mock models report ready
  await page.getByTestId("open-tool-detective-vision").click();
  await expect(page.getByTestId("dv-root")).toBeVisible();
  await page.getByTestId("preset-investigate").click();
  for (const m of MODELS) {
    await expect(page.getByTestId(`model-chip-${m}`)).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
  }

  // every mode, with the Investigate overlays
  for (const mode of MODES) {
    await page.getByTestId(`mode-${mode}`).click();
    await page.waitForTimeout(1200); // let the pulse transition finish and history buffers fill
    await page.screenshot({ path: `test-results/dv-${mode}.png` });
  }

  // every overlay on and off, every HUD density
  for (const o of OVERLAYS) {
    await page.getByTestId(`overlay-${o}`).click();
    await page.waitForTimeout(150);
    await page.getByTestId(`overlay-${o}`).click();
  }
  for (const h of ["minimal", "off", "full"]) {
    await page.keyboard.press("h");
    await page.waitForTimeout(150);
    void h;
  }
  await expect(page.getByTestId("dv-controls")).toBeVisible();

  // automatic scan: the mock cup drifts under the reticle and is held there
  await page.getByTestId("mode-detective").click();
  await expect(page.getByTestId("case-file")).toContainText("CUP —", { timeout: 30_000 });

  // snapshot + a 2 s clip
  await page.getByTestId("dv-snapshot").click();
  await expect(page.getByTestId("dv-toast").filter({ hasText: /snapshot/i })).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("dv-record").click();
  await page.waitForTimeout(2000);
  await page.getByTestId("dv-record").click();
  await expect(page.getByTestId("dv-toast").filter({ hasText: /clip saved/i })).toBeVisible({ timeout: 15_000 });

  // back on the board: scan image + linked local finding, snapshot, clip
  await page.getByTestId("dv-close").click();
  await expect(page.getByTestId("board")).toBeVisible();
  // the cup drifts back under the reticle every few seconds, so there may be several scans
  const findings = card(page, "finding", /EV-\d+ · cup — note/);
  await expect(findings.first()).toBeVisible();
  await expect(findings.first()).toContainText("Detective Vision · Local analysis");
  const scans = await findings.count();
  await expect(card(page, "image", /EV-\d+ · cup/)).toHaveCount(scans);
  await expect(page.locator(".react-flow__edge.link-derived-from")).toHaveCount(scans); // each note linked to its crop
  await expect(card(page, "image", /Snapshot/)).toHaveCount(1);
  await expect(card(page, "video", /Clip/)).toHaveCount(1);
  const count = await page.locator(".react-flow__node").count();
  expect(count).toBe(2 * scans + 2);

  // the clip goes back into Detective Vision; scrubbing backwards must not break anything
  await card(page, "video", /Clip/).getByTestId("card-menu").click();
  await page.getByTestId("send-to-detective-vision").click();
  await expect(page.getByTestId("dv-root")).toBeVisible();
  await expect(page.getByTestId("video-scrub")).toBeVisible({ timeout: 15_000 });
  for (const v of ["0.9", "0.1", "0.6", "0"]) {
    await page.getByTestId("video-scrub").fill(v);
    await page.waitForTimeout(400);
  }
  await page.getByTestId("dv-close").click();

  // everything persists across a reload
  // (opening the clip may have produced more scans; count again before reloading)
  const before = await page.locator(".react-flow__node").count();
  const edgesBefore = await page.locator(".react-flow__edge").count();
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(before);
  await expect(page.locator(".react-flow__edge")).toHaveCount(edgesBefore);

  expect(errors()).toEqual([]);
});

test("camera denied → message and a way to open the case's videos instead", async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await openCaseBoard(page, "No Camera Case");
  await page.getByTestId("open-tool-detective-vision").click();
  await expect(page.getByTestId("camera-error")).toContainText(/permission was denied/i);
  await expect(page.getByTestId("camera-error")).toContainText(/no footage in this case/i);

  // a visitor without a camera can run the synthetic demo feed instead
  await page.getByTestId("run-demo-feed").click();
  await expect(page.getByTestId("model-chip-detection")).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
  await expect(page.locator(".dv-name")).toContainText("DEMO FEED");
});

test("opening and closing the tool many times doesn't exhaust WebGL contexts", async ({ page }) => {
  test.setTimeout(180_000);
  const warnings: string[] = [];
  page.on("console", (m) => {
    if (/WebGL contexts|context lost|CONTEXT_LOST/i.test(m.text())) warnings.push(m.text());
  });
  await openCaseBoard(page, "Reopen Case");
  for (let i = 0; i < 18; i++) {
    await page.getByTestId("open-tool-detective-vision").click();
    await expect(page.getByTestId("model-chip-detection")).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
    await page.getByTestId("dv-close").click();
    await expect(page.getByTestId("board")).toBeVisible();
  }
  expect(warnings).toEqual([]);
});
