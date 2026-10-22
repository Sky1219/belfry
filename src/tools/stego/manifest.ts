import type { ToolManifest } from "../types";

export const stegoManifest: ToolManifest = {
  id: "stego-lab",
  name: "Steganography lab",
  shortName: "Steganography",
  blurb: "Hide a message in a photo, or test one for hidden data",
  icon: "stego",
  accepts: ["image"],
  demo: { label: "Run the demo image" },
  load: () => import("./StegoView").then((m) => m.StegoView),
};
