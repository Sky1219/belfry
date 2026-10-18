---
name: Belfry
description: A detective's console for investigation tools that run in the browser.
colors:
  bg: "#02060d"
  bg-raised: "#06111d"
  bg-panel: "rgba(6, 17, 29, 0.86)"
  line: "rgba(89, 217, 255, 0.28)"
  line-strong: "rgba(89, 217, 255, 0.6)"
  cyan: "#59d9ff"
  cyan-dim: "rgba(89, 217, 255, 0.55)"
  cyan-faint: "rgba(89, 217, 255, 0.12)"
  orange: "#ffa040"
  orange-dim: "rgba(255, 160, 64, 0.55)"
  red: "#ff5a5a"
  green: "#6dffb0"
  text: "#cfeffc"
  text-dim: "#7fa7b8"
typography:
  display:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "0.5em"
  headline:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "0.02em"
  case-name:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "0.01em"
  title:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
  body-small:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  panel-title:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: "0.2em"
  button:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: "0.14em"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: "0.18em"
  chip:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "10px"
    fontWeight: 400
    letterSpacing: "0.15em"
rounded:
  none: "0px"
  sm: "2px"
  pill: "999px"
spacing:
  2xs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "32px"
components:
  button-hud:
    backgroundColor: "transparent"
    textColor: "{colors.cyan}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-hud-hover:
    backgroundColor: "{colors.cyan-faint}"
    textColor: "{colors.cyan}"
  button-hud-active:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.bg}"
  button-hud-danger:
    backgroundColor: "transparent"
    textColor: "{colors.red}"
  button-hud-small:
    padding: "4px 10px"
    height: "28px"
  input-hud:
    backgroundColor: "rgba(0, 0, 0, 0.35)"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  panel:
    backgroundColor: "{colors.bg-panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "10px 14px 14px"
  dialog:
    backgroundColor: "{colors.bg-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    width: "460px"
  chip-ready:
    textColor: "{colors.green}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  chip-loading:
    textColor: "{colors.cyan-dim}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  chip-offline:
    textColor: "{colors.red}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  evidence-card:
    backgroundColor: "{colors.bg-panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "10px 10px 8px"
    width: "220px"
  exhibit-stamp:
    textColor: "{colors.cyan}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "1px 5px"
  exhibit-stamp-finding:
    textColor: "{colors.orange}"
  board-toolbar:
    backgroundColor: "{colors.bg-raised}"
    padding: "10px 16px 0"
  evidence-index:
    backgroundColor: "{colors.bg-raised}"
    width: "272px"
  toast:
    backgroundColor: "{colors.bg-raised}"
    textColor: "{colors.text}"
    typography: "{typography.body-small}"
    padding: "6px 6px 6px 14px"
---

# Design System: Belfry

## Overview

**Creative North Star: "The Batcomputer"**

Belfry is the detective's machine in the cave: an industrial, high-tech control room crossed with gothic-noir minimalism and dark deco architecture, dense with surveillance data. Everything sits in near-black, lit by its own cold Nightglass Cyan. The light comes from the instruments, never from the room. Readouts are monospace and uppercase, frames are hairline and near-square, and the only warm colors are evidence and alarms. The theme comes through materials, light and density, never through borrowed marks. The North Star is an internal reference: per PRODUCT.md, the shipped UI never uses DC names, logos, silhouettes or fonts.

The system is a single monospace family, a two-accent palette (cyan for system, amber for evidence), smoked-glass panes with cyan corner brackets, and a red pin on every exhibit. Density is high and type is small (13px base, 11–12px labels and readouts), on purpose: this is a console you read, not a page you scroll. The case board carries the full idea: a **wall** (the canvas, darkened at the edges) with exhibits pinned to it, **consoles** built into the room (the toolbar with its readout strip, the evidence index) that cast shadow onto the wall, and **panes** in front (dialogs, menus, toasts). **Dark deco ornament** grows out of the bracket: stepped double corners on exhibits and panes, and a doubled rule under the console. Chevrons and heavier geometric framing remain open for later surfaces.

Confirmed rejections: **generic sci-fi neon** (rainbow or purple-pink cyberpunk gradients, Tron grids) and **friendly SaaS** (rounded cards, pastel accents, soft shadows, cheerful empty states).

**Key Characteristics:**
- Near-black field (#02060d) lit only by emitted cyan light.
- One typeface, JetBrains Mono, at two weights; uppercase tracked labels carry the structure.
- Two accents with fixed meanings: cyan is the system, amber is evidence.
- Hairline borders at 28% and 60% cyan; corners are 2px or none.
- Corner brackets on panels, stepped double corners on exhibits: the recurring signature.
- Three planes, wall, console and pane, each with its own depth.
- Every exhibit carries a stable `EXH·nnn` stamp, a timestamp and where it came from.
- High information density; status is always visible, stated in words, never implied by decoration.

## Colors

A cold monochrome of black and cyan, broken only by amber evidence and the red of pins and alarms.

### Primary
- **Nightglass Cyan** (`cyan`): the system's own light. Panel titles, button text and borders, icons, exhibit and case stamps, the focus ring, active states, the connector studs on cards, the HUD wordmark and Detective Vision's 2D overlay strokes. When something is *on*, it is filled with Nightglass Cyan and its text drops to Tower Night (`button-hud-active`).
- **Nightglass Dim** (`cyan-dim`): secondary cyan for loading chips, status lines and the strings of links you drew on the board. It reaches only about 4.2:1 on Tower Night, so keep it to short labels.
- **Nightglass Haze** (`cyan-faint`): hover fills, selection backgrounds and the soft halo behind glowing elements.

### Secondary
- **Evidence Amber** (`orange`): everything that is a *finding*. Finding cards' stamp, icon and deco corners, `EV-nn` tags and object outlines in Detective Vision, the HUD hint pill, warning toasts and the storage banner. Amber means "this is evidence or needs your eye", and it is never decorative.
- **Evidence Amber Dim** (`orange-dim`): the border of finding cards, the dashed derived-from string (with an amber arrowhead) and amber hint pills.

### Tertiary
- **Pin Red** (`red`): the tack on every evidence card, destructive buttons, `offline` chips and the blinking `SIGNAL LOST` status. Red is reserved for the physical pin and for failure.
- **Ready Green** (`green`): used only for the `ready` status chip.

### Neutral
- **Tower Night** (`bg`): the page, the board wall and the Detective Vision stage. The case list adds a one-off radial wash from #071a2e at the top, like distant light reaching down a shaft. The wall darkens toward its edges with a black vignette (to 60%).
- **Console Slate** (`bg-raised`): the toolbar, evidence index, zoom readout, dialogs, card menus, toasts and edge-label plates. The readout strip sits on a 28% black inset within it.
- **Smoked Glass** (`bg-panel`): translucent panels and evidence cards, always with `backdrop-filter: blur(6px)` when floating over live content.
- **Hairline Cyan** (`line`) and **Edge Cyan** (`line-strong`): every border. Hairline for resting frames, Edge for buttons, hover and open menus.
- **Pale Readout** (`text`): primary text, a cyan-tinted white.
- **Faded Readout** (`text-dim`): secondary text, labels, timestamps and empty states.

### Named Rules
**The Instrument Light Rule.** Light is emitted by instruments, never ambient. Glow (text-shadow, box-shadow halos) appears only on things that are live: the wordmark, the tool title plate, hovered or selected controls. A surface with nothing to report does not glow.

**The Two Signals Rule.** Cyan means system and amber means evidence. Never swap them, and never add a third accent for decoration. Red and green are status, not palette.

## Typography

**Display Font:** JetBrains Mono (with ui-monospace, SF Mono, Menlo, Consolas)
**Body Font:** JetBrains Mono, the same family
**Label/Mono Font:** JetBrains Mono, the same family

**Character:** One monospace family at 400 and 700 does everything. Hierarchy comes from case, tracking and color rather than size. That reads as terminal output and machine labels, the voice of a console rather than a publication.

### Hierarchy
- **Display** (700, 22px, 0.5em tracking, uppercase): the `BELFRY` wordmark on the case list, with a faint cyan halo. Only the wordmark uses it.
- **Headline** (700, 20px): the heading of a pane that speaks to you, such as the empty wall ("The wall is bare."). Sentence case.
- **Case Name** (700, 17px, 15px on phones): the case's own name in the board console.
- **Title** (700, 13px, 1.35 line height): case titles in the list, exhibit titles (clamped to two lines), and the Detective Vision tool name (which adds 0.25em tracking and cyan).
- **Body** (400, 13px, the root size): form text, dialog copy, the case-list pitch and index rows.
- **Body Small** (400, 12px, 1.5 line height): exhibit bodies (clamped to five lines), help text, case-row meta, toasts and readout values. The Detective Vision case file uses it for its typewriter reveal.
- **Panel Title** (400, 11px, 0.2em tracking, uppercase, Nightglass Cyan): the heading of every panel and dialog ("OPEN A NEW CASE", "NO SIGNAL", "PIN A NOTE").
- **Button** (400, 11px, 0.14em tracking, uppercase): all HUD buttons, small ones included (0.12em).
- **Label** (400, 11px, 0.18em tracking, uppercase, Faded Readout): field labels, counts ("EVIDENCE · 1 OF 3"), readout captions, exhibit type and footer lines, control-row headings. Status chips stay at 10px/0.15em, the one size below 11px.

### Named Rules
**The Readout Rule.** Anything structural (titles, labels, buttons, statuses) is uppercase and tracked. Anything the user wrote or the tools observed (case names, note text, findings) stays in its own case. Typography tells you whether a word belongs to the machine or to the evidence.

## Layout

A full-viewport app shell: `body` never scrolls, and each screen owns its own scroll region. The **case list** is a single centered column, at most 800px wide, with 20px between panels: wordmark and a one-line pitch, then the new-case form, then numbered case rows. The **board** is a console across the top (a control row of back, case number and name, and grouped actions; below it a full-width readout strip of OPENED, EXHIBITS, LINKS and LAST ACTIVITY), a 272px evidence index on the left and the wall filling the rest, with a bracketed zoom readout pinned 16px in from its bottom-right corner. Toolbar actions sit in groups (add evidence, tools, case) divided by hairlines. **Detective Vision** is a full-bleed stage with HUD pieces placed absolutely in from the edges at a 16px gutter: title plate top-left, status chips top-right, toasts top-center, the control dock along the bottom (capped at 45% height and scrolling), and the case file panel bottom-right.

Spacing runs on small steps: 4, 6, 8, 12 (the base `--gap`) and 16px, with 32px only for page-level top padding. Rows and columns use flex with the 12px gap. Density is intentionally high.

Responsive behavior: at **1100px and below** toolbar buttons become icon-only (their text stays available to screen readers). At **720px and below** the toolbar stacks into three rows (identity, actions, readouts, with the readouts scrolling sideways), the evidence index becomes a drawer over the wall opened from a list button, the first fit of the wall starts no smaller than 60% so cards stay legible, and the Detective Vision case file moves from bottom-right to the top. At **600px and below** case-list rows stack their actions under the title. On coarse pointers every button, menu item and zoom control grows to a 44px target.

## Elevation & Depth

Depth is structural: a **layered control room**. The wall is the back plane (Tower Night with a dot grid, a faint 160px deco line grid and an edge vignette). Consoles are built into the room and cast shadow onto the wall: the toolbar downward, the evidence index sideways. Exhibits are physical objects pinned to the wall. Panes (dialogs, menus, toasts, the empty-wall prompt, the mobile drawer) float in front with the deepest shadow and arrive with a short rise. Glow stays reserved for live or selected elements. The shadow values live as tokens in `src/ui/theme.css`.

### Shadow Vocabulary
- **Pinned object** (`--shadow-pinned: 0 6px 24px rgba(0, 0, 0, 0.45)`): exhibits on the wall.
- **Console** (`--shadow-console: 0 12px 28px -14px rgba(0, 0, 0, 0.85)`; sideways as `--shadow-console-side`): the toolbar, evidence index and zoom readout over the wall.
- **Pane** (`--shadow-pane: 0 24px 64px -18px rgba(0, 0, 0, 0.8)`): dialogs, menus, toasts, the empty-wall prompt, the open drawer.
- **Selected halo** (`0 0 18px var(--cyan-faint)`, on top of Pinned object): a selected exhibit, together with a full cyan (amber for findings) border.
- **Hover halo** (`0 0 14px var(--cyan-faint)`): HUD buttons on hover.
- **Focus haze** (`0 0 0 4px var(--cyan-faint)` with a 1px cyan outline at 2px offset): every focused control.
- **Instrument glow** (`text-shadow: 0 0 18px var(--cyan-faint)`; 8px on the tool title plate): the wordmark and the Detective Vision title.

The pin itself no longer glows at rest (it isn't live); it flares red only during the arrival strike.

### Named Rules
**The Planes Rule.** Every surface belongs to a plane: the wall (board canvas, stage), the console (toolbar, sidebar, control dock), or a pane in front of it (panels, dialogs, menus). A new surface states its plane, and depth cues follow the plane, not the component.

## Shapes

Near-square everywhere: 2px corners on panels, buttons and inputs, and none on evidence cards, case rows, menus or the Detective Vision title plate. Only status chips are pills, and only dots and the pin are circles. Borders are 1px hairlines. Emphasis comes from color (Hairline Cyan to Edge Cyan to full Nightglass Cyan), never from thicker strokes, with one exception: the corner brackets.

**Corner brackets** are the signature form. Two 10px L-shaped cyan corners (2px strokes) sit top-left and bottom-right on every `.panel`, and 8px versions frame the zoom readout. The Detective Vision title plate uses the same idea as a 2px top and left rule.

**Stepped deco corners** (`DecoCorners`) double the bracket: a 12px 2px-stroke L with a 5px 1px-stroke L stepped 4px inside it, at top-left and bottom-right. They mark exhibits (amber on findings), the empty-wall pane and the drop target. The console's doubled rule (a fading hairline 5px under the toolbar border) is the same move applied to a line.

**Icons** are an authored SVG set (`src/ui/icons.tsx`): 16px grid, 1.5px stroke, square caps, mitred joins, drawn in `currentColor`. Note, image, footage, audio, finding (a cut gem), vision (an aperture), gear, upload, export, link, list, zoom, fit (four brackets), close, more, and demo (a broadcast mast). No Unicode glyphs or emoji stand in for icons.

**Connector studs** on cards are 8px squares (not dots), quiet at 35% until you reach for the card.

## Components

Components are **machined and deco-ornamented**: hairline frames, uppercase tracked labels, 150ms responses, and geometric framing from dark deco architecture grown out of the bracket language.

### Buttons
- **Shape:** near-square (2px), 1px Edge Cyan border, transparent fill, at least 32px tall (28px small, 44px on touch).
- **Primary (`button-hud`):** Nightglass Cyan uppercase text at 11px/0.14em, 7px × 14px padding, no wrapping. With an icon, 8px gap; icon-only buttons are 32px square and carry an `aria-label`.
- **Hover:** Nightglass Haze fill plus a 14px Haze halo, with 150ms transitions.
- **Focus:** the global ring, a 1px cyan outline at 2px offset plus a 4px Haze.
- **Active / selected:** solid Nightglass Cyan fill with Tower Night text. Used for the current mode, preset or toggle, and as the primary action in dialogs (OPEN CASE, PIN NOTE).
- **Launcher (`.primary`):** full cyan border on a Haze fill, for the one tool launch on the empty wall.
- **Danger:** Pin Red text with a 60% red border, labelled with its verb ("Delete case", "Remove exhibit"). A destructive confirmation lands focus on Cancel.
- **Small:** 4px × 10px padding at 11px.
- **Disabled:** 40% opacity, default cursor.

### Chips
- **Style:** pill, 1px Hairline Cyan border, 10px uppercase at 0.15em, 2px × 8px padding, a 6px dot in `currentColor`, with the text reading `label · state`.
- **State:** `ready` is Ready Green, `loading` is Nightglass Dim with the dot blinking (1s, two steps), `offline` is Pin Red (clickable to retry), and `off` is Faded Readout.

### Cards / Containers
- **Panel:** Smoked Glass, 2px corners, Hairline Cyan border, backdrop blur 6px, corner brackets, a Panel Title heading and 10px × 14px body padding.
- **Dialog (`Modal`):** a pane: a Console Slate panel at most 460px wide (settings at most 560px) over a 62% black backdrop, with the Pane shadow and a 280ms rise. `role="dialog"`, labelled by its title, traps Tab, closes on Escape or a backdrop click, and returns focus to whatever opened it. Actions sit right-aligned; a secondary destructive action ("Remove link") sits far left.
- **Exhibit (evidence card):** 220px wide, Smoked Glass, square corners, 10px padding, 7px internal gap, stepped deco corners, the Pinned-object shadow and a 9px Pin Red tack on the top edge. The head row is the `EXH·nnn` stamp (11px, boxed in Edge Cyan; amber on findings), the type as icon plus uppercase label, and a `···` actions button. Then the title (bold 13px, two lines), the thumbnail (at most 150px tall) or a hatched "No preview" plate, the body (12px, five lines), a footer rule with the time (`18 OCT · 14:58`) and provenance ("Pinned by hand", "Imported file", "Detective Vision · Local analysis · from EXH·003", "Staged"), then tags. Finding cards turn border, stamp, icon and corners amber.
- **Arrival:** an exhibit that arrives while the board is in view drops 16px onto the wall from a slight tilt and blur (620ms, expo ease-out), the pin strikes with a brief red flare, and the stamp settles in. It plays once, and not at all under reduced motion.
- **Case row:** square-cornered, Hairline border that turns Edge on hover, 10px × 12px padding. A boxed case number (`Nº 003`) spans the title (bold Pale Readout) and a meta line ("5 exhibits · 3 links · last activity today 15:36 · opened Oct 18, 2026"), and the actions are small HUD buttons.
- **Empty wall:** a centered pane (at most 540px) with deco corners, a Headline ("The wall is bare."), one line of guidance, and the three ways in: pin a note, add photos or footage, and the tool launcher.
- **Toast:** a Console Slate strip with an Edge Cyan border and the Pane shadow, centered 20px above the bottom, announced politely. It holds a message, an optional boxed action (UNDO) and a close button. Warnings are amber. It lasts 7 seconds.

### Inputs / Fields
- **Style:** 35% black fill, 1px Hairline Cyan border, 2px corners, 7px × 10px padding, full width. Selects share the style. Range sliders use `accent-color: var(--cyan)`.
- **Focus:** border goes to full Nightglass Cyan with a 3px Haze ring. Placeholders are Faded Readout (7.85:1), never the browser grey.
- **Toggle:** a square 26×14px track with an 8px square thumb that slides 12px and turns cyan when on, with an uppercase label at 11px/0.1em. It's a keyboard-operable `role="switch"`.

### Navigation
- **Board console:** Console Slate with the Console shadow and doubled rule. The control row holds `CASES` (back), the boxed case number `Nº 003` beside the case name, then three action groups divided by hairlines: add (Note, Evidence), tools (Detective Vision), case (export, settings, and the index toggle on phones). Below it, the readout strip: caption and value pairs divided by hairlines.
- **Evidence index:** a 272px Console Slate column: a count heading ("EVIDENCE · 1 OF 3" when filtered), search and type filter, rows of icon, `EXH·nnn` and title (finding icons amber), an empty state that says which emptiness it is (none yet, or none matching, with Clear filters), and a footer of keyboard shortcuts (`N` note, `E` files, `/` search). On phones it is a drawer with a scrim, closed by Escape, a pick, or its close button.
- **Zoom readout:** a bracketed Console Slate strip on the wall: zoom out, the percentage, zoom in, fit. It replaces React Flow's stock controls.
- **Links:** taut straight strings between connector studs. Links you drew are Nightglass Dim; derived-from links are dashed Evidence Amber Dim with an amber arrowhead toward the source. Selected or focused, they turn full cyan at 2px. Labels sit on Console Slate plates. Double-click a link to label or remove it; Delete removes a selected link (undoable).
- **Tool layer:** tools mount full-screen over the board on Tower Night. Their loading state is a centered tool label, an uppercase status line and `BACK TO BOARD`.

### Detective Vision HUD (signature)
- **Title plate:** 2px cyan top and left rules, 55% Tower Night fill, bold tool name at 0.25em tracking with a cyan glow over an 11px status line (STANDBY, or a blinking Pin Red SIGNAL LOST).
- **Control dock:** pinned 16px from the bottom and sides, 72% Tower Night fill with blur. It holds labeled rows (MODE, OVERLAYS, PRESETS, HUD) of HUD buttons and toggles.
- **Toasts and hints:** centered pills with an 85% Tower Night fill and 11px uppercase text. Toasts are cyan, and hints are Evidence Amber with an amber border.
- **Canvas overlay:** the 2D HUD on the video uses the same tokens in code: Nightglass Cyan strokes, Evidence Amber evidence outlines and `EV-nn` tags, Pale Readout text on 75–78% Tower Night plates.
- **HUD density:** full, minimal or off. When off, only a faint "show HUD" tab remains bottom-right.

## Do's and Don'ts

### Do:
- **Do** take every color from the `:root` tokens in `src/ui/theme.css`. The canvas overlay mirrors them as constants and must stay in sync.
- **Do** keep cyan for system and amber for evidence (The Two Signals Rule). A finding card, an `EV-nn` tag and a scan outline are amber. Everything else interactive is cyan.
- **Do** frame new panels with the corner brackets, and build deco ornament (stepped corners, chevrons, geometric rules) out of that same bracket language at 1–2px cyan strokes.
- **Do** set structural text uppercase and tracked (0.1–0.2em, or 0.5em for the wordmark), and leave user and evidence text in its own case.
- **Do** place every new surface on a plane (wall, console or pane) and give it that plane's shadow token.
- **Do** draw new icons on the 16px grid at 1.5px with square caps, and add them to `src/ui/icons.tsx`.
- **Do** give every exhibit its stamp, time and provenance; a reading that came from a fallback says so.
- **Do** build dialogs on `Modal` and menus with real menu semantics (Escape, outside click, arrow keys, focus returned).
- **Do** keep JS-driven motion behind `prefersReducedMotion()`; the global CSS rule only covers CSS animation. Detective Vision's mode pulse and typewriter reveal still need it.

### Don't:
- **Don't** drift toward generic sci-fi neon: no rainbow or purple-pink gradients, no Tron grids, no extra neon hues beyond the tokens.
- **Don't** drift toward friendly SaaS: no rounded cards (anything above 2px outside chips and dots), no pastel accents, no soft ambient shadows, no cheerful illustrated empty states.
- **Don't** add glow to anything that isn't live (The Instrument Light Rule).
- **Don't** use DC names, logos, bat silhouettes or licensed fonts in shipped UI. "The Batcomputer" is this document's reference, not a label.
- **Don't** introduce a second typeface or new shadow values without adding them to this file first.
- **Don't** use Unicode glyphs or emoji as icons.
- **Don't** make a destructive action irreversible when the store can soft-delete it: offer Undo.
- **Don't** use Nightglass Dim (about 4.2:1 on Tower Night) for running text. It's for short labels and statuses only.
