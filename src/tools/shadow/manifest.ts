import type { ToolManifest } from "../types";

export const shadowManifest: ToolManifest = {
  id: "shadow-geolocation",
  name: "Shadow geolocation",
  blurb: "Where a photo could have been taken, from a shadow and the time",
  icon: "sun",
  accepts: ["image"],
  demo: { label: "Run the demo shadow" },
  load: () => import("./ShadowView").then((m) => m.ShadowView),
};
