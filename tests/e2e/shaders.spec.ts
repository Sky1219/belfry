import { expect, test } from "@playwright/test";

const MODES = ["normal", "detective", "thermal", "night", "motion"] as const;
// overlays as the built-in presets use them, so screenshots show what users see
const OVERLAYS: Record<(typeof MODES)[number], string[]> = {
  normal: [],
  detective: ["xray", "evidence", "depthFog"],
  thermal: ["xray"],
  night: ["evidence", "ghostTrails"],
  motion: ["evidence"],
};

const variance = (px: number[]) => {
  const lum = [];
  for (let i = 0; i < px.length; i += 3) lum.push(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  return lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length;
};
const meanAbsDiff = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

test("every vision-mode program compiles and renders a distinct, non-uniform image", async ({ page }) => {
  await page.goto("./?mock#/dev/shaders");
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__shaderErrors)).toEqual([]);

  const thumbs: Record<string, number[]> = {};
  for (const mode of MODES) {
    await page.evaluate(([m, o]) => window.__setMode!(m as never, o as never), [mode, OVERLAYS[mode]] as const);
    await page.waitForTimeout(900); // let history buffers (night, motion) accumulate
    await page.screenshot({ path: `test-results/mode-${mode}.png` });
    thumbs[mode] = await page.evaluate(() => window.__thumb!());
    expect(variance(thumbs[mode]), `${mode} should not be a flat image`).toBeGreaterThan(20);
  }
  for (const mode of MODES.filter((m) => m !== "normal")) {
    expect(meanAbsDiff(thumbs[mode], thumbs.normal), `${mode} should differ from normal`).toBeGreaterThan(8);
  }
});
