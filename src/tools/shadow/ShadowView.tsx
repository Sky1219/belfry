import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { Evidence } from "../../store/schema";
import { HudButton } from "../../ui/components";
import { ImageToolShell, ToolPanel } from "../imagekit/ImageToolShell";
import { pinResult } from "../imagekit/pin";
import type { Pixels } from "../imagekit/pixels";
import { usePinQueue } from "../imagekit/usePinQueue";
import { useToolImage } from "../imagekit/useToolImage";
import { readMetadata } from "../photo/metadata";
import type { ToolContext } from "../types";
import { makeShadowDemo, readShadowDemo, type Marks } from "./demo";
import { bearingFromField, fieldsFromMetadata, fieldsFromUtc, readOffset, timeFromFields, type TimeFields, type TimeSource } from "./fields";
import { drawGraticule, latitudeTable } from "./graticule";
import { MARK_LABEL, MARK_ORDER, MarksLayer, parkedMarks, type MarkKey } from "./Marks";
import { shadowManifest } from "./manifest";
import {
  METRES_PER_DEG,
  MSG_DEGENERATE,
  formatHeight,
  formatKm,
  formatLon,
  formatPlace,
  shadowFinding,
  solveShadow,
  type Pt,
  type ShadowFix,
} from "./shadow";
import "./shadow.css";

/** Re-solve this long after the last drag step or keystroke: a solve with a bearing takes about 25 ms. */
const SETTLE_MS = 150;
/** How far a mark may be off, in screen pixels: nobody places a mark finer than the screen (Ruling P4-R6). */
const MARK_SCREEN_PX = 3;
/** The pinned map, in pixels. */
const MAP_W = 1440;
const MAP_H = 720;

const SOURCE_LINE: Record<TimeSource, string> = {
  exif: "Date, time and UTC offset from the photo's EXIF.",
  "exif-no-offset": "Date and time from the photo's EXIF. The camera recorded no UTC offset, so enter it.",
  demo: "The demo's marks, time (in UTC) and bearing are filled in.",
  none: "The photo carries no time. Enter when it was taken.",
};

type Finding = ReturnType<typeof shadowFinding>;
type Outcome = { kind: "fix"; fix: ShadowFix; finding: Finding } | { kind: "refusal"; message: string; detail?: string };
type Inputs = { marks: Marks; placed: Record<MarkKey, boolean>; fields: TimeFields; bearing: string; pxSigma: number };

const ALL_PLACED: Record<MarkKey, boolean> = { base: true, top: true, tip: true };
const NONE_PLACED: Record<MarkKey, boolean> = { base: false, top: false, tip: false };

const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** A whole-degree latitude for the table's row heads: "75° N", "0°". */
const tableLat = (lat: number) => (lat === 0 ? "0°" : `${Math.abs(lat)}° ${lat > 0 ? "N" : "S"}`);

/** Marks, time and bearing to a fix, or the first thing that stops one, in the order the visitor works. */
function solve({ marks, placed, fields, bearing, pxSigma }: Inputs): Outcome {
  const missing = MARK_ORDER.filter((k) => !placed[k]);
  // parked marks are a starting point, not a measurement
  if (missing.length) return { kind: "refusal", message: MSG_DEGENERATE, detail: `Still to place: ${joinAnd(missing.map((k) => MARK_LABEL[k]))}.` };
  const time = timeFromFields(fields);
  if ("error" in time) return { kind: "refusal", message: time.error };
  const b = bearingFromField(bearing);
  if ("error" in b) return { kind: "refusal", message: b.error };
  const fix = solveShadow({ marks, timeUtc: time.timeUtc, shadowBearingDeg: b.bearingDeg, pxSigma });
  if ("error" in fix) return { kind: "refusal", message: fix.error };
  return { kind: "fix", fix, finding: shadowFinding(fix) };
}

/** The value as it stood `ms` after it last changed; the first value at once. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** The graticule PNG that pins beside the finding. */
async function mapPng(fix: ShadowFix): Promise<Uint8Array> {
  const c = document.createElement("canvas");
  c.width = MAP_W;
  c.height = MAP_H;
  drawGraticule(c.getContext("2d")!, MAP_W, MAP_H, fix);
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("the map couldn't be saved as a PNG");
  return new Uint8Array(await blob.arrayBuffer());
}

/** The fix on the world, at the panel's width and the screen's pixel density. */
function Graticule(props: { fix: ShadowFix; describedBy: string }) {
  const { fix } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const [cssW, setCssW] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setCssW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = ref.current;
    if (!c || cssW <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(c.width / 2);
    drawGraticule(c.getContext("2d")!, c.width, c.height, fix);
  }, [fix, cssW]);

  // the same give-or-take the circle's finding quotes
  const band = formatKm(fix.uncertaintyDeg * METRES_PER_DEG);
  const places = fix.points.length === 1 ? " Square: the place." : fix.points.length > 1 ? " Squares: the two places." : "";
  return (
    <figure className="sh-map">
      <canvas
        ref={ref}
        className="sh-canvas"
        role="img"
        aria-label="World map of the circle of places, with lines every 30 degrees"
        aria-describedby={props.describedBy}
        data-testid="shadow-graticule"
      />
      <figcaption className="sh-key">
        Amber line: the circle of places, shaded {band} either side for the sun&rsquo;s uncertainty.{places} Ring: where the sun stood overhead.
      </figcaption>
    </figure>
  );
}

/** The circle at every 15 degrees of latitude: the map's numbers, as text. */
function LatitudeTable(props: { fix: ShadowFix }) {
  const rows = useMemo(() => latitudeTable(props.fix), [props.fix]);
  return (
    <table className="sh-table">
      <caption className="label">The circle by latitude</caption>
      <thead>
        <tr>
          <th scope="col">Latitude</th>
          <th scope="col">Longitudes on the circle</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.lat}>
            <th scope="row" className="num">
              {tableLat(r.lat)}
            </th>
            <td className="num">{r.lons.length ? r.lons.map(formatLon).join(", ") : "--"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The sun's height and what it fixes, from the finding's own strings. */
function Readout(props: { fix: ShadowFix; id: string }) {
  const { fix } = props;
  let place = "Circle of places";
  if (fix.points.length === 1) place = `${formatPlace(fix.points[0])} ± ${formatKm(fix.radiusM ?? 0)}`;
  return (
    <dl className="sh-readout" id={props.id}>
      <div>
        <dt className="label">Sun elevation</dt>
        <dd className="num">{formatHeight(fix)}</dd>
      </div>
      <div>
        <dt className="label">{fix.points.length > 1 ? "Two places" : "Place"}</dt>
        {fix.points.length > 1 ? (
          fix.points.map((p) => (
            <dd key={`${p.lat},${p.lon}`} className="num">
              {formatPlace(p)}
            </dd>
          ))
        ) : (
          <dd className="num">{place}</dd>
        )}
      </div>
    </dl>
  );
}

/** One labelled well; an empty required one warns in amber under it. */
function Field(props: { id: string; label: string; warn?: string; children: ReactNode }) {
  return (
    <div className={`col field sh-field ${props.warn ? "warn" : ""}`}>
      <label className="label" htmlFor={props.id}>
        {props.label}
      </label>
      {props.children}
      {props.warn && (
        <span className="label sh-warn" id={`${props.id}-warn`}>
          {props.warn}
        </span>
      )}
    </div>
  );
}

/** The marks over one photo, the time and bearing that go with them, and the fix they give. */
function Lab(props: { ctx: ToolContext; source: Evidence; bytes: Uint8Array; pixels: Pixels }) {
  const { ctx, source, bytes, pixels } = props;
  const ids = useId();
  const [start] = useState(() => {
    const demo = readShadowDemo(source.meta);
    if (demo) {
      return {
        inputs: { marks: demo.marks, placed: ALL_PLACED, fields: fieldsFromUtc(new Date(demo.timeUtc)), bearing: String(demo.bearingDeg) },
        source: "demo" as TimeSource,
      };
    }
    const { fields, source: from } = fieldsFromMetadata(readMetadata(bytes));
    return { inputs: { marks: parkedMarks(pixels), placed: NONE_PLACED, fields, bearing: "" }, source: from };
  });
  const [marks, setMarks] = useState(start.inputs.marks);
  const [placed, setPlaced] = useState(start.inputs.placed);
  const [fields, setFields] = useState(start.inputs.fields);
  const [bearing, setBearing] = useState(start.inputs.bearing);
  const [pinned, setPinned] = useState(0);
  const [shownWidth, setShownWidth] = useState(0);
  const queue = usePinQueue();

  // 3 screen pixels in photo pixels: a 4032 px photo shown 760 px wide makes each one about 5.3
  const onShownWidth = useCallback((w: number) => setShownWidth(Math.round(w)), []);
  const pxSigma = MARK_SCREEN_PX * Math.max(1, shownWidth > 0 ? pixels.width / shownWidth : 1);
  const inputs = useMemo<Inputs>(() => ({ marks, placed, fields, bearing, pxSigma }), [marks, placed, fields, bearing, pxSigma]);
  const settled = useSettled(inputs, SETTLE_MS);
  const outcome = useMemo(() => solve(settled), [settled]);
  // the shown result is for inputs that have since changed: it can't be pinned until it catches up (Ruling P4-R7)
  const pending = settled !== inputs;

  const moveMark = (key: MarkKey, at: Pt) => {
    setMarks((m) => ({ ...m, [key]: at }));
    setPlaced((p) => (p[key] ? p : { ...p, [key]: true }));
  };
  const setField = (k: keyof TimeFields) => (e: ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const pinFix = async () => {
    if (outcome.kind !== "fix") return;
    const { fix, finding } = outcome;
    await queue(async () =>
      pinResult(
        { store: ctx.store, caseId: ctx.caseId, toolId: ctx.toolId },
        {
          source,
          image: {
            bytes: await mapPng(fix),
            mime: "image/png",
            title: "Shadow fix map",
            meta: { map: "shadow-graticule", width: MAP_W, height: MAP_H, sunLocus: finding.meta.sunLocus },
          },
          finding: { title: finding.title, body: finding.body, detail: finding.detail, meta: finding.meta },
        },
      ),
    );
    setPinned((n) => n + 1);
  };

  const offsetWarn = fields.offset.trim() === "" ? "Required" : readOffset(fields.offset) === null ? "Unreadable" : undefined;
  const fix = outcome.kind === "fix" ? outcome : null;
  const readoutId = `${ids}-readout`;

  return (
    <ImageToolShell
      tool={shadowManifest}
      ctx={ctx}
      source={source}
      pixels={pixels}
      screenLayer={<MarksLayer pixels={pixels} marks={marks} onMove={moveMark} describedBy={`${ids}-how`} onShownWidth={onShownWidth} />}
    >
      <ToolPanel id="inputs" title="Marks, time and bearing" lamp="off">
        <p className="sh-body" id={`${ids}-how`}>
          Drag <b>BASE</b> to where the object meets the ground, <b>TOP</b> to its top and <b>TIP</b> to the end of its shadow. Arrow keys
          nudge a mark 1 px, with Shift 10.
        </p>
        <p className="sh-source">{SOURCE_LINE[start.source]}</p>
        <div className="sh-time">
          <Field id={`${ids}-date`} label="Date">
            <input id={`${ids}-date`} type="date" className="hud-input num" value={fields.date} onChange={setField("date")} data-testid="shadow-date" />
          </Field>
          <Field id={`${ids}-time`} label="Time">
            <input
              id={`${ids}-time`}
              type="time"
              step={1}
              className="hud-input num"
              value={fields.time}
              onChange={setField("time")}
              data-testid="shadow-time"
            />
          </Field>
          <Field id={`${ids}-offset`} label="UTC offset" warn={offsetWarn}>
            <input
              id={`${ids}-offset`}
              type="text"
              className="hud-input num"
              value={fields.offset}
              placeholder="+01:00"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!offsetWarn}
              aria-describedby={offsetWarn ? `${ids}-offset-warn` : undefined}
              onChange={setField("offset")}
              data-testid="shadow-offset"
            />
          </Field>
          <Field id={`${ids}-bearing`} label="Shadow bearing">
            <input
              id={`${ids}-bearing`}
              type="text"
              inputMode="decimal"
              className="hud-input num"
              value={bearing}
              placeholder="Optional"
              autoComplete="off"
              aria-describedby={`${ids}-bearing-hint`}
              onChange={(e) => setBearing(e.target.value)}
              data-testid="shadow-bearing"
            />
          </Field>
        </div>
        <p className="sh-hint" id={`${ids}-bearing-hint`}>
          The bearing is optional: the direction the shadow points, in degrees clockwise from true north. Without it the fix is a circle of places.
        </p>
      </ToolPanel>

      <ToolPanel
        id="fix"
        title="Fix"
        lamp={pending ? "pulse" : fix ? "amber" : "off"}
        readout={<span className="num">{pending ? "Recomputing" : fix ? `EL ${formatHeight(fix.fix)}` : "EL --"}</span>}
        onPin={fix ? pinFix : undefined}
        pinDisabled={pending}
        pinned={pinned}
      >
        {fix ? (
          <div className={`col sh-result ${pending ? "stale" : ""}`} data-stale={pending} data-testid="shadow-result">
            <p className="sh-verdict" data-testid="shadow-verdict">
              {fix.finding.title}
            </p>
            <Readout fix={fix.fix} id={readoutId} />
            {/* the map, the table and the body change on every nudge of a mark: only the verdict and readout are announced */}
            <div className="col sh-quiet" aria-live="off">
              <Graticule fix={fix.fix} describedBy={readoutId} />
              <LatitudeTable fix={fix.fix} />
              <p className="sh-body">{fix.finding.body}</p>
            </div>
          </div>
        ) : (
          <div className="sh-refusal" data-testid="shadow-refusal">
            <p className="sh-refusal-text">{outcome.kind === "refusal" && outcome.message}</p>
            {outcome.kind === "refusal" && outcome.detail && <p className="sh-body">{outcome.detail}</p>}
          </div>
        )}
      </ToolPanel>
    </ImageToolShell>
  );
}

/**
 * Shadow geolocation: three marks on a photo (an upright object's base and top, and its shadow's
 * tip), the time it was taken and optionally the shadow's bearing give the sun's height, the
 * circle of places that saw it, and with the bearing the place itself. Pins the fix and its map.
 */
export function ShadowView({ ctx }: { ctx: ToolContext }) {
  const image = useToolImage(ctx, makeShadowDemo);
  if (image.phase === "ready") return <Lab key={image.source.id} ctx={ctx} source={image.source} bytes={image.bytes} pixels={image.pixels} />;
  return (
    <ImageToolShell tool={shadowManifest} ctx={ctx}>
      {image.phase === "error" && (
        <ToolPanel id="photo" title="No photo" lamp="off">
          <p className="sh-refusal-text" role="alert">
            {image.message}
          </p>
          <div>
            <HudButton small onClick={() => ctx.openInput("pick")}>
              Choose another photo
            </HudButton>
          </div>
        </ToolPanel>
      )}
    </ImageToolShell>
  );
}
