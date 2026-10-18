import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so the build works from a GitHub Pages sub-path.
  base: "./",
  plugins: [react()],
  worker: { format: "es" },
  server: { host: true },
});
