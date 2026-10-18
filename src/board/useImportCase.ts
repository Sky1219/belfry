import { useStore } from "../app/storeContext";
import { importCase, ImportError, peekImport } from "../store/exportImport";
import { useDialogs } from "../ui/dialogs";

/** Import flow shared by the case list and settings: peek, ask replace/copy if needed, report errors. */
export function useImportCase() {
  const store = useStore();
  const dialogs = useDialogs();
  return async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { exists } = await peekImport(store, bytes);
      let mode: "replace" | "copy" = "replace";
      if (exists) {
        const pick = await dialogs.choose("Case already exists", "This case is already in Belfry. Replace it, or import a separate copy?", [
          { id: "copy", label: "Import as copy" },
          { id: "replace", label: "Replace" },
        ]);
        if (!pick) return;
        mode = pick as "replace" | "copy";
      }
      await importCase(store, bytes, mode);
    } catch (e) {
      const msg = e instanceof ImportError ? e.message : `Import failed: ${e instanceof Error ? e.message : String(e)}`;
      await dialogs.alert("Import failed", msg);
    }
  };
}
