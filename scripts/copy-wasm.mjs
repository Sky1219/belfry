// Copies MediaPipe's WASM runtime into public/ so it is served from our own origin
// (no CDN dependency at runtime). Runs on `npm install` via the postinstall script.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");

if (!existsSync(src)) {
  console.warn("[copy-wasm] @mediapipe/tasks-vision is not installed; skipping.");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[copy-wasm] MediaPipe WASM copied to public/mediapipe/wasm");
