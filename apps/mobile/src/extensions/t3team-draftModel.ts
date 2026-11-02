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

/**
 * Stores a model on the draft, as picking it in the picker does (without making it the sticky
 * default). A draft that carries one needs no loaded catalog to show the composer.
 */
export function setDraftModelSelection(draftKey: string, selection: DraftModelRef): void {
  updateComposerDraftSettings(draftKey, {
    modelSelection: {
      instanceId: ProviderInstanceId.make(selection.instanceId),
      model: selection.model,
    },
  });
}

/** The model the user last picked on this device, whichever environment it was picked on. */
export function useStickyModelSelection(): DraftModelRef | null {
  return plain(useStickyComposerModelSelection());
}
