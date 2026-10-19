import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so the build works from a GitHub Pages sub-path.
  base: "./",
  plugins: [react()],
  worker: { format: "es" },
  build: {
    rollupOptions: {
      output: {
        // Vendors in their own long-lived chunks, so an app change doesn't re-download React or React Flow.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@xyflow") || id.includes("d3-")) return "vendor-flow";
          if (id.includes("/react") || id.includes("scheduler")) return "vendor-react";
          if (id.includes("dexie") || id.includes("fflate") || id.includes("ulid")) return "vendor-store";
          return undefined;
        },
      },
    },
  },
  server: { host: true },
});
