---
version: 1
slug: "src-board"
primary_target: "src/board"
related_targets: ["src/app","src/ui","src/tools/detective"]
---

# Surface brief: Case board (and the app shell around it)

Scope: the case list, the case board and the shared UI shell (src/board, src/app, src/ui), with Detective Vision's HUD restyled into the same world. Visitor mode: Operate.

Audience and job: the developer and cold public visitors equally (PRODUCT.md). Open a case, get evidence onto the wall, send it to a tool, read what came back.

Constraints: no DC names, marks or bat silhouettes in shipped UI; honest readings; keyboard and screen-reader behavior from the last pass must survive; controls stay standard web controls.

Pinned by the user (2026-10-18): two reference images. Image 1 (a screen wall in a dark room): layout and flourishes. Image 2 (industrial console hardware): color scheme. Black and red are required. Monitor-wall layout. Light-touch bezels.

## Direction contract

THESIS: The case is a wall of monitors in a dark steel room. The board is the main screen; instrument screens flank it. It refuses the single-canvas node editor with a toolbar on top.

OWN-WORLD: Near-black room in warm-lit gunmetal (image 2): bezels with a warm lit top edge, lamp light spilling along each bezel, a red floor glow, red pinpoints on the wall between screens; screens are black glass with a dot grid and faint scan lines. Bone-white line work and text, warm signal red for live data, selection, primary actions and alerts, amber screen readouts for evidence and findings, steel grey for secondary text. Barlow Condensed uppercase for labels and controls, Barlow for running text, JetBrains Mono for numerals, IDs and timestamps. Red indicator dots, OFFLINE plates, hazard-stripe warning plates, big red numerals over solid red meters and bar traces.

STORY: The visitor sees a working investigation console, understands that every screen is part of one case, and pins, links and sends evidence without hunting for controls.

FIRST VIEWPORT: Top console rail (mark, case Nº, case name, grouped actions). Below, three screens in bezels: left evidence index screen (search, filter, list), center board screen (largest, about 60% width; its title plate carries its own EXH/LNK readout), right column of three stacked screens: readouts (big red numerals with solid meters, plus a bar trace of when evidence was found, from the times the cards show), feeds (grayscale thumbnails of image and footage exhibits), tools (Detective Vision online; roadmap tools as OFFLINE plates). Phone: rail with labelled primary actions (note, evidence, the tool), the board fitted to the whole case, index and instruments in drawers.

FORM: Pinned by the user (reference images); the roll ran for the record and the pinned direction beats it. seed:d19ce503d5793bb4

Signature move: the monitor wall itself, with grayscale feed screens that light up red when their exhibit is selected on the board.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
