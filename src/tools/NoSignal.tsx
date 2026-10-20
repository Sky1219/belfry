import { useEffect, useRef, useState } from "react";
import { addEvidenceFiles, evidenceTypeFor } from "../board/addFiles";
import type { Evidence } from "../store/schema";
import type { EvidenceStore } from "../store/store";
import { Bezel, HudButton } from "../ui/components";
import { Icon } from "../ui/icons";
import { fileAcceptFor, pickableEvidence } from "./inputs";
import { encodeInput } from "./registry";
import type { EvidenceInput, ToolManifest } from "./types";

const NOUN: Record<Exclude<EvidenceInput, "live-camera">, { plural: string; one: string }> = {
  image: { plural: "photos", one: "photo" },
  video: { plural: "footage", one: "video" },
  audio: { plural: "recordings", one: "recording" },
};

const fileKinds = (accepts: EvidenceInput[]) => accepts.filter((a): a is Exclude<EvidenceInput, "live-camera"> => a !== "live-camera");
const orList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);

/**
 * The screen a tool shows when it has nothing to look at: no camera, a missing
 * file, or opened from the rack with no input. It offers the case's evidence
 * the tool takes, a file from this device (pinned to the case first, so results
 * link back to it) and the tool's demo.
 */
export function NoSignal(props: {
  tool: ToolManifest;
  caseId: string;
  store: EvidenceStore;
  /** Why there's no input, e.g. "Camera permission was denied." Omitted when the tool was simply opened without one. */
  message?: string;
  /** False while the demo itself is what failed. */
  offerDemo?: boolean;
  openInput(input: string): void;
  close(): void;
}) {
  const { tool, caseId, store } = props;
  const [items, setItems] = useState<Evidence[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const kinds = fileKinds(tool.accepts);
  const accept = fileAcceptFor(tool.accepts);

  useEffect(() => {
    let alive = true;
    store.listEvidence(caseId).then((all) => alive && setItems(pickableEvidence(all, tool.accepts)));
    return () => {
      alive = false;
    };
  }, [store, caseId, tool.accepts]);

  const onFile = async (f: File) => {
    const type = evidenceTypeFor(f);
    if (!type || !tool.accepts.includes(type)) {
      setProblem(`${f.name}: ${tool.name} can't open that kind of file.`);
      return;
    }
    const { added, skipped } = await addEvidenceFiles(store, caseId, [f]);
    if (added[0]) props.openInput(encodeInput({ kind: "evidence", id: added[0].id }));
    else if (skipped[0]) setProblem(`${skipped[0].name}: ${skipped[0].reason}.`);
  };

  const nouns = orList(kinds.map((k) => NOUN[k].plural));
  const fileLabel = kinds.length === 1 ? `Open a ${NOUN[kinds[0]].one} file` : "Open a file";
  const camera = tool.accepts.includes("live-camera");
  const offerDemo = props.offerDemo ?? true;

  return (
    <div className="no-signal-host">
      <Bezel title="No signal" titleId="no-signal-title" lamp="amber" className="no-signal">
        <div className="panel-body col" data-testid="no-signal">
          <p className="no-signal-msg">{problem ?? props.message ?? `Choose what ${tool.name} should look at.`}</p>
          {items && items.length > 0 && (
            <>
              <span className="label">{nouns ? `${nouns[0].toUpperCase()}${nouns.slice(1)} in this case` : "In this case"}</span>
              <ul className="no-signal-list">
                {items.map((e) => (
                  <li key={e.id}>
                    <HudButton className="with-icon" data-testid={`no-signal-evidence-${e.id}`} onClick={() => props.openInput(`ev:${e.id}`)}>
                      <Icon name={e.type === "audio" ? "audio" : e.type === "video" ? "video" : "image"} size={14} /> {e.title}
                    </HudButton>
                  </li>
                ))}
              </ul>
            </>
          )}
          {items && items.length === 0 && nouns && (
            <p className="dim no-signal-msg">
              There&rsquo;s no {nouns} in this case yet. Open a file from this device{offerDemo ? `, ${camera ? "run the demo" : "or run the demo"}` : ""}
              {camera ? ", or allow camera access and reopen the tool" : ""}.
            </p>
          )}
          <div className="no-signal-actions">
            {accept && (
              <HudButton className="with-icon" data-testid="no-signal-file" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={14} /> {fileLabel}
              </HudButton>
            )}
            {offerDemo && (
              // with nothing in the case, the demo is the quickest way to see the tool work
              <HudButton className="with-icon" active={items?.length === 0} data-testid="run-demo" onClick={() => props.openInput("demo")}>
                <Icon name="demo" size={14} /> {tool.demo.label}
              </HudButton>
            )}
            <HudButton onClick={props.close}>Back to board</HudButton>
          </div>
          {accept && (
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              hidden
              data-testid="no-signal-file-input"
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                ev.target.value = "";
                if (f) void onFile(f);
              }}
            />
          )}
        </div>
      </Bezel>
    </div>
  );
}
