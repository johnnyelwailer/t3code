import { ProviderInstanceId } from "@t3tools/contracts";

import {
  getComposerDraftSnapshot,
  updateComposerDraftSettings,
  useComposerDraft,
  useStickyComposerModelSelection,
} from "../state/use-composer-drafts";

/** A model as a distribution names it: plain ids, branded inside the app. */
export interface DraftModelRef {
  readonly instanceId: string;
  readonly model: string;
}

const plain = (selection: DraftModelRef | null | undefined): DraftModelRef | null =>
  selection ? { instanceId: selection.instanceId, model: selection.model } : null;

/** The model the draft carries, or null: the user's pick, or the one a distribution preselected. */
export function useDraftModelSelection(draftKey: string | null): DraftModelRef | null {
  return plain(useComposerDraft(draftKey).modelSelection);
}

/** The same, read once outside a component (an effect deciding whether the draft needs a model). */
export function readDraftModelSelection(draftKey: string): DraftModelRef | null {
  return plain(getComposerDraftSnapshot(draftKey).modelSelection);
}

/** Whether the model was stored: an instance id the contracts refuse is reported, never thrown. */
export type SetDraftModelResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "invalid-instance-id" };

/**
 * Stores a model on the draft, as picking it in the picker does (without making it the sticky
 * default). A draft that carries one needs no loaded catalog to show the composer. A provider id the
 * contracts cannot brand is refused with a result, so one bad id from a distribution cannot throw into
 * the draft screen.
 */
export function setDraftModelSelection(
  draftKey: string,
  selection: DraftModelRef,
): SetDraftModelResult {
  let instanceId: ReturnType<typeof ProviderInstanceId.make>;
  try {
    instanceId = ProviderInstanceId.make(selection.instanceId);
  } catch {
    return { ok: false, reason: "invalid-instance-id" };
  }
  updateComposerDraftSettings(draftKey, { modelSelection: { instanceId, model: selection.model } });
  return { ok: true };
}

/** The model the user last picked on this device, whichever environment it was picked on. */
export function useStickyModelSelection(): DraftModelRef | null {
  return plain(useStickyComposerModelSelection());
}
