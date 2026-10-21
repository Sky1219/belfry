import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
// Faces are bundled with the app (no font CDN): nothing loads from a third party unless a key is set.
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "./ui/theme.css";
import { App } from "./app/App";
import { registerTool } from "./tools/registry";
import { detectiveManifest } from "./tools/detective/manifest";
import { fingerprintManifest } from "./tools/fingerprint/manifest";
import { photoManifest } from "./tools/photo/manifest";
import { stegoManifest } from "./tools/stego/manifest";

registerTool(detectiveManifest);
registerTool(photoManifest);
registerTool(fingerprintManifest);
registerTool(stegoManifest);

const isMock = new URLSearchParams(window.location.search).has("mock");
const ShaderHarness = lazy(() => import("./tools/detective/dev/ShaderHarness").then((m) => ({ default: m.ShaderHarness })));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isMock && window.location.hash.startsWith("#/dev/shaders") ? (
      <Suspense fallback={null}>
        <ShaderHarness />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
