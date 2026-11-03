import { ProjectId, ProviderInstanceId, type ServerConfig } from "@t3tools/contracts";

import { buildModelOptions } from "../lib/modelOptions";

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

/**
 * Whether the draft screen would have a model to pick from this server's catalog: the same
 * `buildModelOptions` filter the stock screen uses (provider enabled for the project, installed, not
 * signed out, at least one model that is not hidden). A distribution releases its hold on the
 * catalog only when this is true, so the hold and the stock screen can never disagree.
 */
export function hasSelectableModel(
  config: ServerConfig | null | undefined,
  projectId: string | null,
): boolean {
  if (!config) return false;
  let project: ReturnType<typeof ProjectId.make> | null = null;
  try {
    project = projectId === null ? null : ProjectId.make(projectId);
  } catch {
    project = null;
  }
  return buildModelOptions(config, null, undefined, project).some(
    (option) => !option.isUnavailable,
  );
}
