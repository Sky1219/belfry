import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  // Shared CI runners render WebGL in software and can stall under load; one retry there, none locally.
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173/",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
