import type { ToolManifest } from "../types";

export const photoManifest: ToolManifest = {
  id: "photo-forensics",
  name: "Photo forensics",
  shortName: "Photo",
  blurb: "Metadata, JPEG quantization, error levels, noise and clone detection",
  icon: "forensics",
  accepts: ["image"],
  demo: { label: "Run the demo photo" },
  load: () => import("./PhotoForensicsView").then((m) => m.PhotoForensicsView),
};
