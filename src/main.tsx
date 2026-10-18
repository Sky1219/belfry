import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./ui/theme.css";
import { App } from "./app/App";
import { registerTool } from "./tools/registry";
import { detectiveManifest } from "./tools/detective/manifest";

registerTool(detectiveManifest);

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
