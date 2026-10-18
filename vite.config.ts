import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works on GitHub Pages (sky1219.github.io/detective-vision/).
  base: "./",
  server: { host: true },
});
