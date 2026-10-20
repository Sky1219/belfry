import { useStore } from "../app/storeContext";
import { importCase, ImportError, peekImport } from "../store/exportImport";
import { useDialogs } from "../ui/dialogs";
import { useToast } from "../ui/toasts";

/** Import flow shared by the case list and settings: peek, ask replace/copy if needed, report errors. */
export function useImportCase() {
  const store = useStore();
  const dialogs = useDialogs();
  const toast = useToast();
  return async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { caseId, exists } = await peekImport(store, bytes);
      let mode: "replace" | "copy" = "replace";
      if (exists) {
        const current = await store.getCase(caseId);
        const count = (await store.listEvidence(caseId)).length;
        const pick = await dialogs.choose(
          "Case already here",
          `“${current?.title ?? "This case"}” is already in Belfry with ${count} exhibit${count === 1 ? "" : "s"}. ` +
            "Replace overwrites it with the file’s version, and any changes made here since it was exported are lost. A copy keeps both.",
          [
            { id: "copy", label: "Import as a copy" },
            { id: "replace", label: "Replace this case", danger: true },
          ],
        );
        if (!pick) return;
        mode = pick as "replace" | "copy";
      }
      const c = await importCase(store, bytes, mode);
      toast({ message: `Imported “${c.title}”` });
    } catch (e) {
      const msg = e instanceof ImportError ? e.message : `Import failed: ${e instanceof Error ? e.message : String(e)}`;
      await dialogs.alert("Import failed", msg);
    }
  };
}
