/**
 * Cross-window reads of a queued cloud send. Each window's draft store is its own in-memory copy;
 * the persisted draft storage is what all windows share, so a claim-holder decides on it, and a
 * window whose copy disagrees adopts the persisted draft instead of acting on a phantom.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { COMPOSER_DRAFT_STORAGE_KEY, DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { decodeCloudQueuedSend, type CloudQueuedSend } from "./t3team-cloudQueuedSendModel";

interface PersistedDraft {
  /** False when the draft session is gone from storage (retired after delivery, or discarded). */
  readonly sessionExists: boolean;
  readonly promotedTo: { readonly environmentId: string; readonly threadId: string } | null;
  readonly prompt: string | null;
  readonly queued: CloudQueuedSend | null;
}

type RawState = {
  draftsByThreadKey?: Record<string, { prompt?: unknown; cloudQueuedSend?: unknown }>;
  draftThreadsByThreadKey?: Record<string, { promotedTo?: PersistedDraft["promotedTo"] }>;
};

/** The draft as persisted, or null without storage (then memory is all there is). */
function readPersistedDraft(draftId: string): PersistedDraft | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(COMPOSER_DRAFT_STORAGE_KEY);
    const state = raw === null ? {} : ((JSON.parse(raw) as { state?: RawState }).state ?? {});
    const composer = state.draftsByThreadKey?.[draftId];
    const session = state.draftThreadsByThreadKey?.[draftId];
    return {
      sessionExists: session !== undefined,
      promotedTo: session?.promotedTo ?? null,
      prompt: typeof composer?.prompt === "string" ? composer.prompt : null,
      queued: decodeCloudQueuedSend(composer?.cloudQueuedSend),
    };
  } catch {
    return null;
  }
}

/** Makes this window's draft follow the persisted one: delivered, cancelled, or changed. */
function adoptPersistedDraft(draftId: string, persisted: PersistedDraft): void {
  const store = useComposerDraftStore.getState();
  if (persisted.promotedTo !== null) {
    // By draft id: this window's copy may still point at the machine it was queued from.
    store.markDraftThreadPromoting(
      DraftId.make(draftId),
      scopeThreadRef(
        EnvironmentId.make(persisted.promotedTo.environmentId),
        ThreadId.make(persisted.promotedTo.threadId),
      ),
    );
  } else if (!persisted.sessionExists) {
    store.clearDraftThread(DraftId.make(draftId));
    return;
  }
  useComposerDraftStore.setState((state) => {
    const draft = state.draftsByThreadKey[draftId];
    if (draft === undefined) return state;
    return {
      draftsByThreadKey: {
        ...state.draftsByThreadKey,
        [draftId]: {
          ...draft,
          // Text typed in this window since the queue cleared its prompt is the user's: keep it.
          prompt: draft.prompt.length > 0 ? draft.prompt : (persisted.prompt ?? draft.prompt),
          cloudQueuedSend: persisted.queued,
        },
      },
    };
  });
}

/**
 * Under the claim: the persisted record when it is still this message (failed or not). When the
 * persisted draft disagrees with this window's copy, the copy adopts it and the answer is null.
 */
export function confirmPersistedCloudQueuedSend(
  draftId: string,
  messageId: string,
): CloudQueuedSend | null {
  const persisted = readPersistedDraft(draftId);
  const current = useComposerDraftStore.getState().draftsByThreadKey[draftId]?.cloudQueuedSend;
  if (persisted === null) return current?.messageId === messageId ? current : null;
  const same =
    persisted.promotedTo === null &&
    persisted.queued?.messageId === messageId &&
    JSON.stringify(persisted.queued) === JSON.stringify(current ?? null);
  if (!same) adoptPersistedDraft(draftId, persisted);
  return persisted.promotedTo === null && persisted.queued?.messageId === messageId
    ? persisted.queued
    : null;
}
