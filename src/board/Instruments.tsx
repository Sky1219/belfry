import { useMemo } from "react";
import { useBlobUrl } from "../app/storeContext";
import type { Case, Evidence, Link } from "../store/schema";
import { PLANNED_TOOLS } from "../tools/roadmap";
import { Bezel, HudButton } from "../ui/components";
import { Icon } from "../ui/icons";
import type { BoardTool } from "./Board";
import { exhibitTag } from "./EvidenceCard";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

/** Exhibits pinned per time slice across the case's life, for the activity trace. */
export function activityBins(createdAts: number[], from: number, to: number, bins: number): number[] {
  const out = new Array(bins).fill(0);
  const span = Math.max(1, to - from);
  for (const t of createdAts) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor(((t - from) / span) * bins)));
    out[i]++;
  }
  return out;
}

/** Case readouts: big red numerals and a trace of when evidence arrived. */
export function ReadoutsScreen(props: { theCase?: Case; evidence: Evidence[]; links: Link[]; lastActivity: number }) {
  const findings = props.evidence.filter((e) => e.type === "finding").length;
  // the time each card shows: when the evidence was found, not when it was stored
  const times = useMemo(() => props.evidence.map((e) => e.provenance.createdAt || e.createdAt), [props.evidence]);
  const from = Math.min(props.theCase?.createdAt ?? Date.now(), ...times);
  const to = Math.max(from + 60_000, ...times);
  const BINS = 24;
  const bins = useMemo(() => activityBins(times, from, to, BINS), [times, from, to]);
  const max = Math.max(0, ...bins);
  const W = 240;
  const H = 44;
  const step = W / BINS;

  const big = (label: string, value: number, tone?: "amber") => (
    <div className={`readout ${tone ?? ""} ${value === 0 ? "zero" : ""}`}>
      <span className="readout-value num">{pad(value)}</span>
      <span className="readout-label">{label}</span>
    </div>
  );

  return (
    <Bezel title="Readouts" titleId="screen-readouts" lamp={props.evidence.length ? "on" : "off"} className="instrument readouts-bezel" meta={<span>CASE</span>}>
      <div className="readouts-screen">
        <div className="readout-row" data-testid="readout-exhibits">
          {big("Exhibits", props.evidence.length)}
          {big("Links", props.links.length)}
          {big("Findings", findings, "amber")}
        </div>
        <figure className="trace" aria-label={`Exhibits pinned over the life of the case, ${props.evidence.length} in total`}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            {bins.map((_, i) => (
              <rect key={`t${i}`} className="trace-slot" x={i * step + 1} y={0} width={step - 2} height={H} />
            ))}
            {max > 0 &&
              bins.map((v, i) =>
                v ? (
                  <rect key={i} className="trace-bar" x={i * step + 1} y={H - (v / max) * H} width={step - 2} height={(v / max) * H} />
                ) : null,
              )}
          </svg>
          <figcaption>
            <span>Found over time</span>
            <span className="num">{props.evidence.length ? `${clock(from)} → ${clock(to)} · peak ${max}` : "none yet"}</span>
          </figcaption>
        </figure>
      </div>
    </Bezel>
  );
}

function Feed(props: { e: Evidence; exhibit?: number; lit: boolean; onPick: () => void }) {
  const e = props.e;
  const url = useBlobUrl(e.thumbHash ?? (e.type === "image" ? e.blobHash : undefined));
  return (
    <li>
      <button
        type="button"
        className={`feed ${props.lit ? "lit" : ""}`}
        onClick={props.onPick}
        aria-pressed={props.lit}
        aria-label={`${exhibitTag(props.exhibit)} ${e.title}, ${e.type === "video" ? "footage" : "image"}`}
        data-testid="feed"
      >
        {url ? <img src={url} alt="" draggable={false} /> : <span className="feed-blank">No signal</span>}
        <span className="feed-tag num">{exhibitTag(props.exhibit)}</span>
        {e.type === "video" && (
          <span className="feed-kind">
            <Icon name="video" size={12} />
          </span>
        )}
      </button>
    </li>
  );
}

/** Surveillance feeds: every photo and piece of footage in the case, in grayscale until picked. */
export function FeedsScreen(props: {
  evidence: Evidence[];
  exhibits: Map<string, number>;
  selectedId?: string;
  onPick: (e: Evidence) => void;
  onAdd: () => void;
}) {
  const feeds = props.evidence.filter((e) => e.type === "image" || e.type === "video");
  return (
    <Bezel
      title="Feeds"
      titleId="screen-feeds"
      lamp={feeds.some((e) => e.id === props.selectedId) ? "on" : "off"}
      className="instrument feeds-bezel"
      meta={<span className="num">{pad(feeds.length)}</span>}
    >
      {feeds.length ? (
        <ul className="feeds" data-count={Math.min(feeds.length, 5)}>
          {feeds.map((e) => (
            <Feed key={e.id} e={e} exhibit={props.exhibits.get(e.id)} lit={e.id === props.selectedId} onPick={() => props.onPick(e)} />
          ))}
        </ul>
      ) : (
        <div className="screen-empty">
          <span className="plate steel">No feeds</span>
          <p>Photos and footage you pin show up here.</p>
          <HudButton small className="with-icon" onClick={props.onAdd}>
            <Icon name="upload" size={12} /> Add files
          </HudButton>
        </div>
      )}
    </Bezel>
  );
}

/** The tools rack: live tools to launch, planned ones marked OFFLINE. */
export function ToolsScreen(props: { tools: BoardTool[] }) {
  return (
    <Bezel title="Tools" titleId="screen-tools" lamp="off" className="instrument tools-bezel">
      <ul className="rack">
        {props.tools.map((t) => (
          <li key={t.id} className="rack-row live">
            <span className="lamp ok" aria-hidden />
            <span className="rack-name">{t.name}</span>
            <HudButton small className="with-icon" onClick={t.open} data-testid={`rack-open-${t.id}`} aria-description={t.blurb}>
              <Icon name="vision" size={12} /> Open
            </HudButton>
          </li>
        ))}
        {PLANNED_TOOLS.map((t) => (
          <li key={t.id} className="rack-row">
            <span className="lamp" aria-hidden />
            <span className="rack-name dim">
              {t.name}
              <span className="rack-phase">{t.phase}</span>
            </span>
            <span className="plate steel" title="Planned, not built yet">
              Offline
            </span>
          </li>
        ))}
      </ul>
    </Bezel>
  );
}
