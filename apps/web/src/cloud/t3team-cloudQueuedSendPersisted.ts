/**
 * Cross-window reads of a queued cloud send. Each window's draft store is its own in-memory copy;
 * the persisted draft storage is what all windows share, so a claim-holder decides on it.
 */
import { COMPOSER_DRAFT_STORAGE_KEY, useComposerDraftStore } from "~/composerDraftStore";
import { decodeCloudQueuedSend, type CloudQueuedSend } from "./t3team-cloudQueuedSendModel";

/**
 * The record as persisted (what every window shares), not this window's in-memory copy, which
 * can be stale after another window sent or cancelled it. Falls back to memory without storage.
 */
export function readPersistedDraftCloudQueuedSend(draftId: string): CloudQueuedSend | null {
  if (typeof localStorage === "undefined")
    return useComposerDraftStore.getState().draftsByThreadKey[draftId]?.cloudQueuedSend ?? null;
  try {
    const raw = localStorage.getItem(COMPOSER_DRAFT_STORAGE_KEY);
    const parsed =
      raw === null
        ? null
        : (JSON.parse(raw) as {
            state?: { draftsByThreadKey?: Record<string, { cloudQueuedSend?: unknown }> };
          });
    return decodeCloudQueuedSend(parsed?.state?.draftsByThreadKey?.[draftId]?.cloudQueuedSend);
  } catch {
    return null;
  }
}

/** True when the persisted record is this exact, still-pending message. */
export function isPersistedCloudQueuedSendPending(draftId: string, messageId: string): boolean {
  const persisted = readPersistedDraftCloudQueuedSend(draftId);
  return persisted?.messageId === messageId && persisted.failureMessage === undefined;
}
