import type { SVGProps } from "react";

/**
 * Belfry's icon set: 16px grid, 1.5px stroke, square caps and mitred joins, so
 * every glyph reads as machined line work next to the monospace type.
 */
export type IconName =
  | "note"
  | "image"
  | "video"
  | "audio"
  | "finding"
  | "vision"
  | "gear"
  | "plus"
  | "back"
  | "upload"
  | "export"
  | "link"
  | "list"
  | "zoom-in"
  | "zoom-out"
  | "fit"
  | "close"
  | "more"
  | "demo";

const PATHS: Record<IconName, string> = {
  // a sheet with a folded corner and two ruled lines
  note: "M3.5 1.75h6l3 3v9.5h-9z M9.5 1.75v3h3 M5.75 8.25h4.5 M5.75 11h4.5",
  // a frame with a horizon and a sun
  image: "M1.75 3.25h12.5v9.5H1.75z M1.75 10.5l3.5-3.25 3 2.75 2-1.75 4 3.25 M10.5 6.25h.01",
  // a film frame with sprocket notches and a play wedge
  video: "M1.75 3.25h12.5v9.5H1.75z M1.75 5.75h1.5 M1.75 10.25h1.5 M12.75 5.75h1.5 M12.75 10.25h1.5 M6.5 5.75l3.5 2.25-3.5 2.25z",
  // a waveform
  audio: "M1.5 8h1.75 M4.5 5v6 M7 2.75v10.5 M9.5 5.5v5 M12 6.75v2.5 M14.5 8h-1",
  // a cut gem: what an analysis turned up
  finding: "M4.25 2.25h7.5l2.5 3.5L8 13.75 1.75 5.75z M1.75 5.75h12.5 M6.25 2.25 5 5.75l3 8 3-8-1.25-3.5",
  // an aperture: the lens of a vision tool
  vision: "M8 1.75a6.25 6.25 0 1 1 0 12.5A6.25 6.25 0 0 1 8 1.75z M8 5.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5z M8 1.75v3.5 M14.25 8h-3.5 M8 14.25v-3.5 M1.75 8h3.5",
  // a toothed wheel
  gear: "M6.75 1.75h2.5l.4 1.9 1.3.75 1.85-.6 1.25 2.15-1.45 1.3v1.5l1.45 1.3-1.25 2.15-1.85-.6-1.3.75-.4 1.9h-2.5l-.4-1.9-1.3-.75-1.85.6-1.25-2.15 1.45-1.3v-1.5L1.75 6l1.25-2.15 1.85.6 1.3-.75z M8 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  plus: "M8 2.5v11 M2.5 8h11",
  back: "M13.5 8h-11 M6.5 4 2.5 8l4 4",
  // an arrow rising out of a tray
  upload: "M8 10.5v-8 M4.75 5.5 8 2.25l3.25 3.25 M2.25 9.5v4.25h11.5V9.5",
  // an arrow leaving a tray
  export: "M8 2.25v8 M4.75 7.25 8 10.5l3.25-3.25 M2.25 9.5v4.25h11.5V9.5",
  // two pins joined by a taut line
  link: "M3.5 12.5l9-9 M3.5 10.25a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5z M12.5 1.25a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5z",
  // an index: three ruled entries
  list: "M5.5 3.5h8.75 M5.5 8h8.75 M5.5 12.5h8.75 M1.75 3.5h1.5 M1.75 8h1.5 M1.75 12.5h1.5",
  "zoom-in": "M7 1.75a5.25 5.25 0 1 1 0 10.5A5.25 5.25 0 0 1 7 1.75z M10.75 10.75l3.5 3.5 M4.75 7h4.5 M7 4.75v4.5",
  "zoom-out": "M7 1.75a5.25 5.25 0 1 1 0 10.5A5.25 5.25 0 0 1 7 1.75z M10.75 10.75l3.5 3.5 M4.75 7h4.5",
  // four corner brackets around nothing: frame everything
  fit: "M1.75 5.25v-3.5h3.5 M10.75 1.75h3.5v3.5 M14.25 10.75v3.5h-3.5 M5.25 14.25h-3.5v-3.5",
  close: "M3 3l10 10 M13 3 3 13",
  more: "M3 8h.01 M8 8h.01 M13 8h.01",
  // a broadcast mast: a synthetic signal
  demo: "M8 6.25v8 M5.5 14.25h5 M8 6.25a1.25 1.25 0 1 0 0-.01 M4.75 3.25a4.5 4.5 0 0 0 0 6 M11.25 3.25a4.5 4.5 0 0 1 0 6 M2.75 1.5a7.25 7.25 0 0 0 0 9.5 M13.25 1.5a7.25 7.25 0 0 1 0 9.5",
};

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
      focusable="false"
      className="icon"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
