---
name: Belfry
description: A detective's console for investigation tools that run in the browser.
colors:
  void: "#050506"
  metal-900: "#0e0f11"
  metal-800: "#161719"
  metal-700: "#212225"
  metal-600: "#2e2f33"
  metal-400: "#4d4f54"
  spill-red: "rgba(255, 74, 44, 0.16)"
  spill-amber: "rgba(255, 160, 60, 0.14)"
  screen: "#07090c"
  screen-raised: "#0e1116"
  screen-pane: "rgba(10, 12, 16, 0.94)"
  ink: "#ece6dc"
  ink-dim: "#9aa3ad"
  ink-faint: "rgba(236, 230, 220, 0.07)"
  line: "rgba(236, 230, 220, 0.14)"
  line-strong: "rgba(236, 230, 220, 0.34)"
  signal: "#ff4433"
  signal-dim: "rgba(255, 68, 51, 0.55)"
  signal-faint: "rgba(255, 68, 51, 0.14)"
  signal-deep: "#8f1c13"
  amber: "#ffa733"
  amber-dim: "rgba(255, 167, 51, 0.5)"
  amber-faint: "rgba(255, 167, 51, 0.12)"
  ok: "#6fd38a"
typography:
  wordmark:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.34em"
  readout:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.01em"
  case-name:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.02em"
  title-compact:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.15
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.15
  control:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "0.08em"
  screen-title:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.1em"
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.12em"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  data:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  plate: "1px"
  sm: "2px"
  bezel: "3px"
  dot: "50%"
spacing:
  2xs: "4px"
  xs: "6px"
  sm: "8px"
  stack: "10px"
  md: "12px"
  wall: "14px"
  xl: "16px"
  2xl: "20px"
components:
  button-key:
    backgroundColor: "{colors.metal-600}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "5px 14px"
    height: "32px"
  button-key-engaged:
    backgroundColor: "{colors.signal}"
    textColor: "#1a0503"
  button-key-danger:
    backgroundColor: "{colors.metal-600}"
    textColor: "#ff7466"
  button-key-danger-hover:
    backgroundColor: "{colors.signal-deep}"
    textColor: "#ffffff"
  button-key-small:
    padding: "3px 10px"
    height: "28px"
  input-well:
    backgroundColor: "#030405"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
    height: "34px"
  bezel:
    backgroundColor: "{colors.metal-700}"
    textColor: "{colors.ink}"
    typography: "{typography.screen-title}"
    rounded: "{rounded.bezel}"
    padding: "0 5px 5px"
  screen:
    backgroundColor: "{colors.screen}"
    rounded: "{rounded.sm}"
  plate-steel:
    backgroundColor: "{colors.metal-800}"
    textColor: "{colors.ink-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.plate}"
    padding: "2px 8px"
  chip-status:
    textColor: "{colors.ok}"
    typography: "{typography.label}"
    rounded: "{rounded.plate}"
    padding: "1px 8px"
  evidence-card:
    backgroundColor: "rgba(10, 12, 15, 0.97)"
    textColor: "{colors.ink}"
    typography: "{typography.body-small}"
    padding: "0 10px 8px"
    width: "220px"
  evidence-stamp:
    textColor: "{colors.ink-dim}"
    typography: "{typography.data}"
  evidence-stamp-selected:
    textColor: "{colors.signal}"
  evidence-stamp-finding:
    textColor: "{colors.amber}"
  readout:
    backgroundColor: "{colors.screen}"
    textColor: "{colors.signal}"
    typography: "{typography.readout}"
    padding: "10px 12px 9px"
  readout-zero:
    textColor: "{colors.ink-dim}"
  case-number:
    backgroundColor: "rgba(255, 68, 51, 0.06)"
    textColor: "{colors.signal}"
    typography: "{typography.data}"
    padding: "5px 8px"
  rail:
    backgroundColor: "{colors.metal-900}"
    textColor: "{colors.ink}"
    padding: "9px 14px"
  toast:
    backgroundColor: "{colors.metal-700}"
    textColor: "{colors.ink}"
    typography: "{typography.body-small}"
    rounded: "{rounded.bezel}"
    padding: "5px 5px 5px 12px"
  modal:
    backgroundColor: "{colors.metal-700}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bezel}"
    width: "460px"
---

# Design System: Belfry

## Overview

**Creative North Star: "The Monitor Wall"**

Belfry is a wall of monitors in a dark steel room. Every surface is a screen set in a light gunmetal bezel: the case board is the main screen, and instrument screens (evidence index, readouts, feeds, tools) flank it. Between the screens the wall is near-black, with sparse red pinpoints. A warm-lit steel console rail runs across the top, and a low red glow rises from the floor. The light belongs to the hardware, and it means something: a lamp is lit only when its screen has something live, a key is lit only when it is the next step, and red marks only what is live, selected, primary or alarming. The North Star is an internal reference; the shipped UI carries no borrowed names or marks.

The material comes from industrial console hardware: warm gunmetal with a lit top edge, black glass screens with a dot grid and faint scan lines, bone-white line work and text, and two lights. Signal red is live data, selection, primary action and alarm. Amber is findings and warnings. Steel grey carries secondary text and everything at rest. Type is a condensed uppercase hardware voice (Barlow Condensed) for labels and controls, a plain humanist voice (Barlow) for what people wrote, and a monospace voice (JetBrains Mono) for numerals, IDs and times. Density is that of a console: small type, packed screens, status always visible and stated in words, but evidence stays readable on the wall at every zoom.

The signature move is the wall itself, with grayscale surveillance feeds that light up in color, framed in red, when their exhibit is selected on the board. Big red numerals over solid red meters, steel OFFLINE plates on unbuilt tools, and hazard-stripe plates for warnings complete the vocabulary. The world rejects the single-canvas node editor with a toolbar on top: content lives on screens, not on a bare page.

**Key Characteristics:**
- A near-black room (`void`) with a red floor glow and a sparse field of red pinpoints between screens.
- Every surface is a black-glass screen in a 3px gunmetal bezel with a warm lit top edge; its title and lamp sit on the bezel.
- Two lights with fixed meanings: signal red (live, selected, primary, alarm) and amber (findings, warnings). At rest, things are Steel Grey.
- Lamps report state; a lit bezel throws warm light down onto the wall.
- Bone line work (`ink` at 14% and 34%) draws every hairline; steel grey (`ink-dim`) carries secondary text.
- Three type voices: condensed uppercase for hardware, humanist for writing, monospace for numbers.
- Imagery sits in grayscale until it is picked, and then lights in full color.
- Corners stay near-square: 1px plates, 2px keys and glass, 3px bezels.

## Colors

A warm gunmetal and black-glass room lit by two lights, signal red and amber, with bone line work.

### Primary
- **Signal Red** (`signal`): live data, selection, primary actions and alarms. Lit lamps, the engaged key, non-zero readout numerals, the activity trace bars, case numbers (`Nº 001`), a selected card's frame and stamp, a lit feed's frame and tag, the selected index row's stamp and icon, the zoom percentage, links when selected, the global focus ring, the pin on every card, the toast lamp and the UNDO key. In Detective Vision it is x-ray's color and the HUD's alert color.
- **Signal Dim** (`signal-dim`): borders only, for case-number boxes and the primary key's inner rim. Never text.
- **Signal Haze** (`signal-faint`): the focus haze, the selection marquee and the lit row in the evidence index (at 16%).
- **Signal Deep** (`signal-deep`): the hover fill of a danger key. Danger text itself is a lighter red (#ff7466) so it holds 4.5:1 on the steel key face.

### Secondary
- **Readout Amber** (`amber`): findings and warnings. Finding cards' stamp, icon, corners and selected frame; a non-zero FINDINGS readout; amber lamps (a staged demo case, Detective Vision's No Signal); warning toasts; the storage banners and the drop hint (with hazard stripes); `EV-nn` tags and evidence outlines on the Detective Vision overlay; the case file's title.
- **Amber Dim** (`amber-dim`) and **Amber Haze** (`amber-faint`): a finding card's resting border, the dashed derived-from link, the hint pill's border and amber plates.

### Tertiary
- **Lamp Green** (`ok`): status only. The lamp of a live tool in the tools rack, the System screen's lamp and the `ready` chip.

### Neutral
- **Void** (`void`): the room. The page, the tool layer and the Detective Vision stage. The app frame adds a red floor glow (13% at the bottom) and a faint steel light from the top.
- **Console Gunmetal** (`metal-900` through `metal-400`): the hardware. Bezels run `metal-700` to `metal-900` top to bottom; keys run `metal-600` to `metal-700`; `metal-400` is idle lamps, toggle thumbs, `kbd` edges and scrollbars.
- **Lamp Spill** (`spill-red`, `spill-amber`): the warm light a lit lamp throws along its bezel, as a 120px radial behind the bezel head.
- **Black Glass** (`screen`): every screen surface. `screen-raised` is a pane set on the glass, and `screen-pane` is the translucent empty-board pane.
- **Bone** (`ink`): primary text and line work. `line` (14%) is every resting hairline; `line-strong` (34%) is card frames, panes and link label plates; `ink-faint` (7%) is the hover wash on rows.
- **Steel Grey** (`ink-dim`): secondary text, labels, captions, placeholders and empty states (about 7.7:1 on Black Glass). It is also the at-rest state of things that light up: card stamps, zero readouts, OFFLINE plates and the focused input's border.

### Named Rules
**The Two Lights Rule.** Red is live, selected, primary or alarm; amber is a finding or a warning. Nothing at rest is red: a card's stamp is Steel Grey until the card is selected, a readout at zero is Steel Grey with no glow, and an unbuilt tool's OFFLINE plate is steel. Lamp green is status, and the false color inside Detective Vision's camera modes belongs to the feed, not the HUD.

**The Lit Feed Rule.** Photos and footage sit in grayscale (feeds fully, card thumbnails at 85%) until they are hovered or selected; selection restores full color and frames them in Signal Red. Color in an image means attention.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow, system-ui), self-hosted at 500, 600 and 700
**Body Font:** Barlow (with system-ui), self-hosted at 400, 500 and 600
**Label/Mono Font:** JetBrains Mono (with ui-monospace, SF Mono, Menlo, Consolas), self-hosted at 400 and 700, tabular numerals

**Character:** A condensed industrial grotesque stamped on the hardware, a plain humanist sans for what people wrote, and a monospace for anything counted, numbered or timed. All three faces are bundled with the app; nothing loads from a font CDN.

### Hierarchy
- **Wordmark** (Barlow Condensed 700, 30px, 0.34em tracking, uppercase; 24px on phones): `BELFRY` on the case list rail, led by a lamp. Only the wordmark uses it.
- **Readout** (JetBrains Mono 700, 32px, line height 1): the big numerals on the Readouts and System screens, zero-padded (`05`), in Signal Red (Amber for findings) with a soft 14px glow; Steel Grey without glow at zero.
- **Headline** (Barlow Condensed 700, 28px, 1.05; 24px on phones): a pane that speaks to you, such as "The wall is bare." Sentence case.
- **Case Name** (Barlow Condensed 700, 22px, 1.1; 19px on phones): the open case's name on the board rail.
- **Title Compact** (Barlow Condensed 600, 24px, three lines): an exhibit's title when the wall is zoomed below 70%, over a 15px stamp.
- **Title** (Barlow Condensed 600, 17px, 1.15): exhibit titles on cards, clamped to two lines. Case rows use Barlow 600 at 16px; the tools rack uses 15px uppercase at 0.06em.
- **Control** (Barlow Condensed 600, 14px, 0.08em, uppercase): every key, menu item, toast in Detective Vision and the drop hint. Small keys and phone rail keys drop to 13px.
- **Screen Title** (Barlow Condensed 600, 13px, 0.1em, uppercase): the title on every bezel and dialog.
- **Label** (Barlow Condensed 600, 12px, 0.12em, uppercase, Steel Grey): field labels, readout captions, card type, provenance, plates and chips.
- **Body** (Barlow 400, 14px, 1.45): the root size; forms, dialog copy (to 60ch), the case-list pitch (to 64ch), index rows.
- **Body Small** (Barlow 400, 13px, 1.45): card bodies (clamped to five lines), help text, case meta, toasts.
- **Data** (JetBrains Mono, 11–13px, tabular): `EXH·nnn` stamps (700), card times (`OCT 18 · 16:38`), bezel readouts (`EXH 05 LNK 03`), feed tags, the trace span (`17:58 → 18:38 · peak 1`), case numbers, the zoom value, `kbd` keys and the Detective Vision status line and case file.

### Named Rules
**The Three Voices Rule.** Hardware speaks in condensed uppercase; people speak in Barlow, in their own case; the machine's numbers, IDs and times speak in mono. If a word is a control or a label, it's Barlow Condensed; if someone wrote it, it's Barlow; if it counts or identifies, it's JetBrains Mono. Screen readers hear identifiers as words ("Exhibit 7"), never as spelled-out letters.

## Layout

A full-viewport app: `body` never scrolls and each screen owns its own scroll region. A **rail** (a steel console strip with a 1px black edge and a tick ruler hanging 5px below it) runs across the top of every view. Below it, the **monitor wall** is a CSS grid of bezels laid over the pinpoint field: 14px gaps on the board (wide enough for a lit bezel's floor glow to land on the wall), 10px on the case list and between stacked instruments, with 14px / 10px / 10px padding.

- **Case board:** the rail holds back (`CASES`), the boxed case number with the case name over an uppercase sub-line (opened, last activity), then grouped actions divided by a black-and-highlight seam (Note and Evidence; the tool; export and settings). The wall is three columns: the evidence index (264px), the board screen (the remainder; its bezel carries its own `EXH nn LNK nn` readout), and an instruments column (300px) of three stacked screens: Readouts, Feeds (flexible height, at least 120px) and Tools.
- **Case list:** the rail holds the wordmark and a one-line pitch, with Settings at the far end. The wall is two columns (1.35fr and at least 320px): Case Files on the left; New Case, Demo Case and System stacked on the right.
- **Detective Vision:** a full-bleed stage with HUD pieces set 16px in from the edges: the title plate top-left, status chips top-right, toasts top-center, the control console along the bottom (capped at 45% height, scrolling inside its frame), and the case file pane bottom-right. Without a feed, a No Signal bezel sits centered.

**The board's first fit** holds a zoom floor (0.85 on desktop, 0.6 on phones) so cards stay readable, and opens on the case's next step: the demo's "Your move" note on its first visit (selected), otherwise the newest exhibit. New exhibits are placed clear of existing cards, link lines and link labels; scan findings sit beside their crop; anything that arrives after the board opened is selected and brought into view.

Spacing runs on 4, 6, 8, 10, 12, 14, 16 and 20px. Screens pad 8–12px inside the glass; bezel heads are 28px tall.

Responsive behavior: at **1280px and below** the instruments column becomes a right-hand drawer (up to 320px) behind a Gauges toggle on the rail. At **1100px and below** the case list's side column narrows to 300px. At **960px and below** rail keys go icon-only (their text stays for screen readers). At **860px and below** the board wall is a single column, the evidence index becomes a left-hand drawer with a 60% scrim, and the case list stacks its side screens above Case Files. At **720px and below** the rail wraps to two rows: back and the case name, then the actions with the index and instruments toggles; every rail key shows a short word instead of an icon (Note, Files, Vision, Index, Gauges), and export and settings leave the board. On coarse pointers every key, input, menu item, index row, rack row and zoom control grows to a 44px target.

### Named Rules
**The Monitor Rule.** Every new surface joins the wall as a screen in a bezel (`Bezel`): its title, lamp and readout sit on the bezel, and its content sits on the glass. A surface that floats in front (dialog, menu, toast) is a monitor brought forward and uses the same bezel-and-glass construction.

## Elevation & Depth

Depth is physical: the room, the bezel set into it, the glass recessed into the bezel, and panes brought forward. Bezels and keys catch a warm light along their top edge; glass is recessed with an inner shadow; evidence cards sit on the glass with a soft drop; panes cast the deepest shadow. Glow is reserved for lit things: lamps and the wall under a lit bezel, the engaged key, non-zero readout numerals, a selected card, a lit feed.

### Shadow Vocabulary
- **Bezel edge** (`--bezel-edge: inset 0 1px 0 rgba(255, 170, 130, 0.13), inset 0 -1px 0 rgba(0, 0, 0, 0.6)`): the warm lit top edge on every bezel, plate of hardware, menu, modal, toast and the Detective Vision title plate and console.
- **Bezel** (`--shadow-bezel: 0 10px 30px -12px rgba(0, 0, 0, 0.9)`): bezels on the wall, the zoom plate and the Detective Vision console.
- **Lit bezel floor glow** (`0 22px 44px -26px rgba(255, 74, 44, 0.35)`, added to Bezel): a bezel whose lamp is on throws warm light down onto the wall below it.
- **Glass** (`--glass: inset 0 0 0 1px rgba(0, 0, 0, 0.8), inset 0 18px 40px -24px rgba(0, 0, 0, 0.9)`): every screen, recessed into its bezel.
- **Pinned** (`--shadow-pinned: 0 6px 20px rgba(0, 0, 0, 0.55)`): evidence cards on the board's glass.
- **Pane** (`--shadow-pane: 0 24px 64px -18px rgba(0, 0, 0, 0.85)`): modals, card menus, toasts, the empty-board pane, the drop hint, open drawers and the case file.
- **Lamp glow** (`0 0 6px 1px rgba(255, 68, 51, 0.65)`; amber and green at 55% and 50%): lit lamps, the pin and the toggle thumb.
- **Selected** (`0 0 0 1px` signal plus `0 0 22px rgba(255, 68, 51, 0.25)`, over Pinned): a selected card; amber at 22% for a finding. A lit feed uses `0 0 16px rgba(255, 68, 51, 0.35)`.
- **Engaged key** (`inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 0 14px -2px rgba(255, 68, 51, 0.55)`): the key lit red.
- **Focus haze** (`0 0 0 4px` Signal Haze with a 1px Signal Red outline at 2px offset): every focused control except inputs, which take a Steel Grey border and a 3px bone ring at 10%.

### Named Rules
**The Lamp Rule.** A lamp reports state, never decoration. Board: the board screen is on; Readouts is on only when the case has evidence; Feeds is on only when the selected exhibit is a feed; the Evidence index is on only while a search or type filter is active; Tools is off. Case list: Case Files and Open a New Case are off, Demo Case is amber while staged, System is green. Only lit things glow; a surface with nothing live to report stays matte.

## Shapes

Near-square hardware. Plates and chips are 1px, keys, inputs and glass are 2px, bezels, menus, modals, toasts and the zoom plate are 3px. Only lamps, chip dots and the pin are circles. Borders are 1px: black (`#000`) where hardware meets hardware, bone hairlines (`line`, `line-strong`) on the glass.

**The bezel** is a light-touch frame: 5px of gunmetal on the sides and bottom, a 28px head carrying the lamp, the title and an optional readout, a 1px black outline and the warm top edge. It never thickens and never takes ornament.

**Corner brackets** (`DecoCorners`) are the one framing mark: two 10px L-shaped 1px corners at top-left and bottom-right, in bone by default, amber on findings and the case file. They mark evidence cards, the empty-board pane, the drop hint and the Detective Vision console.

**Hazard stripes** (amber and #111 at -45deg, 6–7px bands) are set into warning plates only: the storage banners and the drop hint.

**The pinpoint field** (`src/ui/pinpoints.svg`) is a 1920×1200 tile of hand-placed 1.1–1.7px dots, mostly Signal Red with a few amber, at 40–80% opacity, seen only in the gaps between screens.

**Icons** are an authored SVG set (`src/ui/icons.tsx`): a 16px grid, 1.5px stroke, square caps and mitred joins, drawn in `currentColor`; the gauge (a dial with a needle) marks the instruments. Connector studs on cards are 8px squares in bone, quiet at 35% until you reach for the card.

## Components

Components are **hardware set into a console**: steel keys, recessed wells, lamps and plates, with 150ms responses.

### Buttons
- **Shape:** a steel key, 2px corners, 1px black border, a `metal-600` to `metal-700` gradient with a faint top highlight; at least 32px tall (28px small, 44px on touch).
- **Default:** Bone, Control type, 5px × 14px padding, no wrapping. With an icon, a 7px gap; icon-only keys are 32px square and carry an `aria-label`.
- **Hover / Focus:** the text goes white and the key brightens one step; pressed, it sinks (`inset 0 2px 4px`). Focus is the global red hairline and haze.
- **Engaged:** lit red (a #ff5a4a to Signal Red to #e5321f gradient) with dark text (#1a0503) and a red glow. It marks the current mode, preset or toggle, and the one next step on a surface: OPEN CASE once a name is typed, Done in Settings (Save stays plain), Run the demo feed when a case has no footage, and the rail's tool key until a tool has been opened once in this browser.
- **Primary (`.primary`):** a steel key with a Signal Dim inner rim, for a strong action that isn't the one lit key.
- **Danger:** a lighter red text (#ff7466) on steel; on hover, a deep-red fill with white text. Always labelled with its verb ("Delete case", "Close case"); a destructive confirmation lands focus on Cancel.
- **Disabled:** 40% opacity, default cursor.

### Named Rules
**The Next Step Rule.** A surface lights at most one key outside its mode and preset groups, and that key is the next step. Everything else is plain steel.

### Chips
- **Status chip:** a 1px-cornered tag with a hairline border, Label type, 1px × 8px padding and a 6px dot in `currentColor`, reading `label · state`. `ready` is Lamp Green, `loading` is Amber with the dot blinking (1s, two steps), `offline` is Signal Red (clickable to retry), `off` is Steel Grey.
- **Plates:** labels set into the hardware. `steel` (OFFLINE on unbuilt tools, No feeds) is Steel Grey on `metal-800` with a `metal-400` border; `amber` for findings.

### Cards / Containers
- **Bezel and screen:** see Shapes. A lit lamp (`on`, `pulse`, `amber`, `ok`) throws Lamp Spill along its bezel head, and `on` adds the floor glow. A dot-grid screen variant uses 1px bone dots on an 18px grid.
- **Evidence card:** 220px, near-opaque black (97%), square, a `line-strong` frame, corner brackets, the Pinned shadow and a 9px red pin on the top edge. Its head strip (30px, 5% bone wash, hairline below) holds the `EXH·nnn` stamp (Steel Grey at rest, Signal Red when selected, Amber on findings), the type as icon plus label, and a menu key. Then the title, a grayscale thumbnail (at most 150px) or a scan-lined "No preview" plate, the body, a hairline footer with the time and provenance in Label type ("Staged", "Imported file", "Detective Vision · Local analysis"), then tags. Selected, the frame turns Signal Red with a red glow; findings turn the frame, stamp, icon and brackets Amber. Cards are announced as "Exhibit 7, note: …".
- **Compact card:** below 70% zoom a card shows only its stamp (15px) and title (Title Compact), so the wall stays legible zoomed out.
- **Dimmed card:** while the index search or type filter is active, exhibits outside it drop to 25% opacity in full grayscale.
- **Arrival:** an exhibit that arrives while the board is in view drops 16px onto the glass from a slight blur (620ms), the pin strikes with a red flare, and the stamp settles in. It plays once and not at all under reduced motion.
- **Modal:** a monitor brought forward: a bezel (at most 460px; settings 560px) whose head holds the title and whose glass holds the body, over a 70% black backdrop, rising in over 280ms. `role="dialog"`, labelled by its title; it traps Tab, closes on Escape or a backdrop click, and returns focus to whatever opened it. Actions sit right-aligned; a secondary destructive action sits far left.
- **Card menu:** a small bezel-edged plate (190px) of uppercase menu items, rendered outside the zoomed wall at full size and fixed under its button; it closes when the wall pans or zooms or the window resizes. Hover and focus wash items red (18%). Real menu semantics: Escape, outside click, arrow keys, focus returned. "Links…" lists the card's links to label or remove; the danger item sits last below a seam.
- **Toast:** a steel plate centered 20px above the foot of the room, with a red lamp (amber and amber text for warnings), the message, an optional lit UNDO key and a close button. Announced politely; lasts 7 seconds. Ctrl/Cmd+Z restores the latest soft delete while the board is open.
- **Empty board:** a translucent pane (at most 540px) with corner brackets, a Headline, one line of guidance and the three ways in.

### Inputs / Fields
- **Style:** a recessed well: #030405, a `metal-600` border, 2px corners, an inner shadow, 6px × 10px padding, at least 34px tall. Selects share the style.
- **Focus:** the border turns Steel Grey with a 3px bone ring at 10%; typing is not an alarm, so it never turns red. Placeholders are Steel Grey, never the browser default.
- **Toggle:** a square 28×14px rocker well with an 8px square thumb that slides 14px and lights red when on; uppercase 13px label. A keyboard-operable `role="switch"`.

### Navigation
- **Rail:** see Layout. Action groups are divided by a 1px black seam with a 5% highlight beside it.
- **Evidence index:** a search well and type filter, then rows of icon, mono `EXH·nnn` and title (findings in Amber), announced as "Exhibit 7, …". The selected exhibit's row lights red (16% wash, red stamp and icon). The lamp is lit while a filter is active. A footer lists the keys (`N` note, `E` files, `/` search). Below 860px it is a drawer with a scrim, closed by Escape, a pick or its close button.
- **Zoom plate:** a small steel plate on the glass: zoom out, the percentage in red mono on a recessed well, zoom in, fit.
- **Links:** taut straight strings between square studs. Links you drew are bone at 55%, 1.25px; derived-from links are dashed Amber Dim. Selected, they turn Signal Red at 2px. Labels sit on `metal-800` plates with a `line-strong` edge. Links are not Tab stops; the keyboard reaches them through a card's Links… menu.

### Instruments (signature)
- **Readouts:** three cells divided by hairlines, each a big zero-padded numeral over a Label caption (EXHIBITS, LINKS, and FINDINGS in Amber), Steel Grey at zero. Then a 24-slot bar trace of when evidence was found, in solid Signal Red bars over faint bone slots, captioned "Found over time" with its span and peak.
- **Feeds:** every photo and piece of footage as a 4:3 grayscale tile with scan lines and an 11px mono exhibit tag (one or two feeds fill the screen). Picking a feed or its card lights it: full color, a red frame and glow, and a red tag. Video carries a small red footage icon.
- **Tools rack:** one row per tool, a lamp, the name in uppercase condensed type and an action: live tools show a green lamp and an OPEN key; planned tools show an idle lamp, their phase, and a steel OFFLINE plate.

### Detective Vision HUD
- **Title plate:** a gunmetal plate with the bezel edge, a red lamp and its spill, the tool name in Barlow Condensed 700 at 18px and 0.16em, over a mono status line (a blinking red SIGNAL LOST when the feed drops; still under reduced motion).
- **No Signal:** a bezel with an amber lamp, centered on the stage, offering the ways in; Run the demo feed is the lit key when the case has no footage.
- **Console:** a 92–94% gunmetal strip pinned 16px from the bottom and sides, blurred behind, with corner brackets: labelled rows (MODE, OVERLAYS, PRESETS, HUD) of keys and toggles, then the capture keys. The current mode and preset are engaged keys.
- **Case file:** a pane with an Amber Dim border, an amber title, amber corner brackets and the Pane shadow; its mono text arrives like a teleprinter, or all at once under reduced motion.
- **Modes:** Detective is a cold grayscale surveillance grade with bone edge lines; x-ray glows Signal Red. The 2D overlay mirrors the tokens in code: Bone text and strokes, Signal Red alerts, Amber `EV-nn` evidence outlines, on 80% black plates.

## Do's and Don'ts

### Do:
- **Do** take every color from the `:root` tokens in `src/ui/theme.css`; the canvas overlay and the shaders mirror Bone, Signal Red and Amber as constants and must stay in sync.
- **Do** build every new surface as a screen in a bezel (The Monitor Rule), with its title, lamp and readout on the bezel.
- **Do** keep red for live, selected, primary and alarm, and amber for findings and warnings; leave everything at rest Steel Grey (The Two Lights Rule).
- **Do** light a lamp only when its screen has something live to report (The Lamp Rule).
- **Do** light at most one key per surface, the next step (The Next Step Rule).
- **Do** show imagery in grayscale until it is picked, and light it in color with a red frame when it is (The Lit Feed Rule).
- **Do** set labels and controls in Barlow Condensed uppercase, writing in Barlow in its own case, and every number, ID and time in JetBrains Mono (The Three Voices Rule).
- **Do** keep evidence readable on the wall: hold the zoom floor on first fit, and drop cards to stamp and title when zoomed out.
- **Do** give every exhibit its `EXH·nnn` stamp, time and provenance, and announce it as "Exhibit n"; a reading that came from a fallback says so, and an unknown value shows `--`.
- **Do** mark unbuilt capability honestly with an idle lamp and a steel OFFLINE plate rather than hiding it or faking it.
- **Do** build dialogs on `Modal` and menus with real menu semantics (Escape, outside click, arrow keys, focus returned).
- **Do** keep JS-driven motion behind `prefersReducedMotion()`; the global CSS rule only covers CSS animation and transitions.
- **Do** offer Undo (toast and Ctrl/Cmd+Z) when a destructive action can soft-delete.

### Don't:
- **Don't** put content on a bare page or a lone full-bleed canvas with a toolbar above it; it belongs on a screen on the wall.
- **Don't** add hues to the HUD beyond Signal Red, Amber and Lamp Green; no cyan, blue or purple chrome.
- **Don't** color an identifier, a zero or an idle status red; red at rest is noise.
- **Don't** add glow to anything that isn't lit (The Lamp Rule).
- **Don't** round anything past 3px, except the circular lamps, dots and pin.
- **Don't** thicken bezels or decorate them beyond the lamp, title, readout and corner brackets.
- **Don't** use DC names, logos, bat silhouettes or licensed fonts in shipped UI.
- **Don't** load fonts from a CDN; faces are bundled through `@fontsource`.
- **Don't** use Unicode glyphs or emoji as icons; draw them on the 16px grid in `src/ui/icons.tsx`.
- **Don't** use Signal Dim or Amber Dim for text; they are border and stroke colors.
