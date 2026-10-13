/**
 * Reads and writes the queued cloud send on a draft's persisted composer state. The record is the
 * single source of truth: the composer banner, the sidebar row, the thread card and the app-level
 * flusher all read it here, so none of them depends on the draft's composer being mounted.
 */
import { useShallow } from "zustand/react/shallow";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { acquireOutboxDispatch, releaseOutboxDispatch } from "~/t3team/outbox/t3team-outboxStorage";
import { isCloudQueuedSendDispatching } from "./t3team-cloudQueuedSendDispatching";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import {
  resolveCloudQueuedSendStepId,
  type CloudQueuedSendStepFacts,
} from "./t3team-cloudQueuedSendSteps";

type DraftsByKey = ReturnType<typeof useComposerDraftStore.getState>["draftsByThreadKey"];

/** draftId -> queued send, for every draft that has one. Values keep their references. */
function selectCloudQueuedSends(draftsByThreadKey: DraftsByKey): Record<string, CloudQueuedSend> {
  const queued: Record<string, CloudQueuedSend> = {};
  for (const [draftKey, draft] of Object.entries(draftsByThreadKey)) {
    if (draft.cloudQueuedSend) queued[draftKey] = draft.cloudQueuedSend;
  }
  return queued;
}

export function useCloudQueuedSends(): Record<string, CloudQueuedSend> {
  return useComposerDraftStore(
    useShallow((state) => selectCloudQueuedSends(state.draftsByThreadKey)),
  );
}

/** True while any draft waits on a cloud session (failed ones are parked, not waiting). */
export function useHasPendingCloudQueuedSends(): boolean {
  return useComposerDraftStore((state) =>
    Object.values(state.draftsByThreadKey).some(
      (draft) =>
        draft.cloudQueuedSend != null && draft.cloudQueuedSend.failureMessage === undefined,
    ),
  );
}

export function useDraftCloudQueuedSend(draftId: string | null): CloudQueuedSend | null {
  return useComposerDraftStore((state) =>
    draftId === null ? null : (state.draftsByThreadKey[draftId]?.cloudQueuedSend ?? null),
  );
}

export function getDraftCloudQueuedSend(draftId: string): CloudQueuedSend | null {
  return useComposerDraftStore.getState().draftsByThreadKey[draftId]?.cloudQueuedSend ?? null;
}

/** Replaces (or clears, with null) the record. False when the draft has no composer state. */
export function writeDraftCloudQueuedSend(draftId: string, next: CloudQueuedSend | null): boolean {
  let written = false;
  useComposerDraftStore.setState((state) => {
    const draft = state.draftsByThreadKey[draftId];
    if (draft === undefined || (next === null && draft.cloudQueuedSend == null)) return state;
    written = true;
    return {
      draftsByThreadKey: {
        ...state.draftsByThreadKey,
        [draftId]: { ...draft, cloudQueuedSend: next },
      },
    };
  });
  return written;
}

/** Updates the record only while it is still the same message. */
export function updateDraftCloudQueuedSend(
  draftId: string,
  messageId: string,
  update: (queued: CloudQueuedSend) => CloudQueuedSend,
): void {
  const current = getDraftCloudQueuedSend(draftId);
  if (current === null || current.messageId !== messageId) return;
  writeDraftCloudQueuedSend(draftId, update(current));
}

/** Records when the send's current bind step was first seen; later sightings keep that time. */
export function stampDraftCloudQueuedSendStep(
  draftId: string,
  facts: Omit<CloudQueuedSendStepFacts, "flushing">,
  at: Date = new Date(),
): void {
  const { queued } = facts;
  if (queued.failureMessage !== undefined) return;
  const stepId = resolveCloudQueuedSendStepId({
    ...facts,
    flushing: isCloudQueuedSendDispatching(queued.messageId),
  });
  if (queued.stepStartedAt?.[stepId] !== undefined) return;
  updateDraftCloudQueuedSend(draftId, queued.messageId, (current) => ({
    ...current,
    stepStartedAt: { ...current.stepStartedAt, [stepId]: at.toISOString() },
  }));
}

export function failDraftCloudQueuedSend(
  draftId: string,
  messageId: string,
  failureMessage: string,
  retryable: boolean,
): void {
  updateDraftCloudQueuedSend(draftId, messageId, (queued) => ({
    ...queued,
    failureMessage,
    retryable,
  }));
}

export function retryDraftCloudQueuedSend(draftId: string): void {
  const current = getDraftCloudQueuedSend(draftId);
  if (current === null) return;
  const { failureMessage: _failure, retryable: _retryable, ...rest } = current;
  writeDraftCloudQueuedSend(draftId, rest);
}

/** The cross-window claim a dispatch and a cancel of one queued message both take. */
export function cloudQueuedSendClaimKey(messageId: string): string {
  return `cloud-queued-send:${messageId}`;
}

/**
 * Cancel: the message goes back into the composer, ahead of anything typed since. Refused (null)
 * while a send is in flight here or in another window: that turn is already starting, so the
 * message is delivered and the draft becomes its thread rather than coming back as text.
 */
export function cancelDraftCloudQueuedSend(draftId: string): CloudQueuedSend | null {
  const current = getDraftCloudQueuedSend(draftId);
  if (current === null || isCloudQueuedSendDispatching(current.messageId)) return null;
  const claimKey = cloudQueuedSendClaimKey(current.messageId);
  if (!acquireOutboxDispatch(claimKey)) return null;
  try {
    restoreQueuedMessage(draftId, current);
  } finally {
    releaseOutboxDispatch(claimKey);
  }
  return current;
}

function restoreQueuedMessage(draftId: string, current: CloudQueuedSend): void {
  const store = useComposerDraftStore.getState();
  const typed = store.draftsByThreadKey[draftId]?.prompt.trim() ?? "";
  // Prompt first: clearing the record on an otherwise empty draft would drop the draft.
  store.setPrompt(
    DraftId.make(draftId),
    typed.length > 0 ? `${current.messageText}\n\n${typed}` : current.messageText,
  );
  writeDraftCloudQueuedSend(draftId, null);
}
