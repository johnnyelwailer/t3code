import type { ScopedThreadRef } from "@t3tools/contracts";
import { threadContextRecord } from "@t3tools/shared/composerContextReferences";

import { useComposerDraftStore } from "~/composerDraftStore";
import { readThreadShell } from "~/state/entities";
import { toastManager } from "~/components/ui/toast";

/**
 * Adds dragged threads to a thread's composer draft, which persists in a store: an unmounted
 * composer shows them when it mounts, a mounted one inserts the reference at the caret. A thread
 * from another environment is skipped: the composer imports its transcript, which needs the
 * mounted composer's upload path, so it still takes that drop itself.
 */
export function addThreadContextsToThread(
  target: ScopedThreadRef,
  refs: ReadonlyArray<ScopedThreadRef>,
): boolean {
  const records = refs.flatMap((ref) => {
    if (ref.environmentId !== target.environmentId) return [];
    const shell = readThreadShell(ref);
    return shell ? [threadContextRecord(ref, shell.title)] : [];
  });
  if (records.length < refs.length) {
    toastManager.add({
      type: "error",
      title: "Some threads were not added",
      description: "Open the thread and drop other machines' threads on its composer.",
    });
  }
  if (records.length === 0) return false;
  useComposerDraftStore.getState().addThreadContexts(target, records);
  return true;
}
