import { useEffect, useRef, useState } from "react";
import { useBlobUrl } from "../../app/storeContext";
import { addEvidenceFiles, evidenceTypeFor } from "../../board/addFiles";
import { exhibitTag } from "../../board/EvidenceCard";
import type { Evidence } from "../../store/schema";
import type { EvidenceStore } from "../../store/store";
import { HudButton } from "../../ui/components";
import { Icon } from "../../ui/icons";
import { fileAcceptFor, pickableEvidence } from "../inputs";

const ACCEPTS = ["image" as const];

function Row(props: { e: Evidence; exhibit?: number; onPick: () => void }) {
  const url = useBlobUrl(props.e.thumbHash ?? props.e.blobHash);
  return (
    <li>
      <button type="button" className="ik-pick-row" data-testid="exhibit-picker-item" onClick={props.onPick}>
        {url ? <img src={url} alt="" draggable={false} /> : <span className="ik-pick-blank" aria-hidden />}
        <span className="ik-pick-title">{props.e.title}</span>
        <span className="num dim">{exhibitTag(props.exhibit)}</span>
      </button>
    </li>
  );
}

/**
 * Chooses a second photo from the case's images, or a file from this device
 * (pinned to the case first, so results can link back to it).
 */
export function ExhibitPicker(props: { caseId: string; store: EvidenceStore; excludeId?: string; onPick(e: Evidence): void }) {
  const { caseId, store, excludeId, onPick } = props;
  const [items, setItems] = useState<Evidence[] | null>(null);
  const [numbers, setNumbers] = useState<Map<string, number>>(new Map());
  const [problem, setProblem] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [all, nums] = await Promise.all([store.listEvidence(caseId), store.exhibitNumbers(caseId)]);
      if (!alive) return;
      setItems(pickableEvidence(all, ACCEPTS).filter((e) => e.id !== excludeId));
      setNumbers(nums);
    };
    void load();
    const off = store.subscribe(caseId, () => void load());
    return () => {
      alive = false;
      off();
    };
  }, [store, caseId, excludeId]);

  const onFile = async (f: File) => {
    if (evidenceTypeFor(f) !== "image") {
      setProblem(`${f.name}: that isn't a photo.`);
      return;
    }
    const { added, skipped } = await addEvidenceFiles(store, caseId, [f]);
    if (added[0]) {
      setProblem(null);
      onPick(added[0]);
    } else if (skipped[0]) setProblem(`${skipped[0].name}: ${skipped[0].reason}.`);
  };

  return (
    <div className="ik-picker col" data-testid="exhibit-picker" aria-busy={items === null}>
      {items && items.length > 0 ? (
        <ul className="ik-pick-list">
          {items.map((e) => (
            <Row key={e.id} e={e} exhibit={numbers.get(e.id)} onPick={() => onPick(e)} />
          ))}
        </ul>
      ) : (
        items && <p className="dim ik-note">No other photos in this case yet.</p>
      )}
      {problem && (
        <p className="ik-problem" role="alert">
          {problem}
        </p>
      )}
      <HudButton small className="with-icon" data-testid="exhibit-picker-file" onClick={() => fileRef.current?.click()}>
        <Icon name="upload" size={12} /> Open a photo file
      </HudButton>
      <input
        ref={fileRef}
        type="file"
        accept={fileAcceptFor(ACCEPTS)}
        hidden
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          ev.target.value = "";
          if (f) void onFile(f);
        }}
      />
    </div>
  );
}
