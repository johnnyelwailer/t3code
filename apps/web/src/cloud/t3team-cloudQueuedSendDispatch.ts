/**
 * Delivers one queued cloud send (retarget the draft, launch its thread, promote it), exactly
 * once: the in-window dispatching set; the renewed cross-window claim (Cancel takes it too) with
 * the persisted record re-read under it; and a command id derived from the message id, so a
 * server replay after a crash, reload or retry returns the first launch's receipt.
 */
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { CommandId, MessageId, type EnvironmentId, type ProjectId } from "@t3tools/contracts";
import { truncate } from "@t3tools/shared/String";

import {
  DraftId,
  markPromotedDraftThreadByRef,
  useComposerDraftStore,
  type DraftSessionState,
} from "~/composerDraftStore";
import { holdCloudQueuedSendClaim } from "./t3team-cloudQueuedSendClaim";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { confirmPersistedCloudQueuedSend } from "./t3team-cloudQueuedSendPersisted";
import {
  failDraftCloudQueuedSend,
  getDraftCloudQueuedSend,
  isCloudQueuedSendDispatching,
  setCloudQueuedSendDispatching,
  writeDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";

export type StartCloudQueuedTurn = (value: {
  readonly environmentId: EnvironmentId;
  readonly input: StartThreadTurnInput;
}) => Promise<AtomCommandResult<unknown, unknown>>;

export function cloudQueuedSendCommandId(messageId: string): CommandId {
  return CommandId.make(`cloud-queued-send:${messageId}`);
}

function buildCloudQueuedTurnInput(input: {
  readonly queued: CloudQueuedSend;
  readonly draft: DraftSessionState;
  readonly projectId: ProjectId;
  readonly projectCwd: string | null;
}): StartThreadTurnInput {
  const { queued, draft } = input;
  const title = truncate(queued.titleSeed);
  const prepareWorktree =
    draft.envMode === "worktree" &&
    draft.worktreePath === null &&
    draft.branch !== null &&
    input.projectCwd !== null
      ? {
          prepareWorktree: {
            projectCwd: input.projectCwd,
            baseBranch: draft.branch,
            ...(draft.startFromOrigin ? { startFromOrigin: true } : {}),
          },
          runSetupScript: true,
        }
      : {};
  return {
    commandId: cloudQueuedSendCommandId(queued.messageId),
    threadId: draft.threadId,
    message: {
      messageId: MessageId.make(queued.messageId),
      role: "user",
      text: queued.outgoingText,
      attachments: [],
    },
    modelSelection: queued.modelSelection,
    titleSeed: title,
    runtimeMode: queued.runtimeMode,
    interactionMode: queued.interactionMode,
    bootstrap: {
      createThread: {
        projectId: input.projectId,
        title,
        modelSelection: queued.modelSelection,
        runtimeMode: queued.runtimeMode,
        interactionMode: queued.interactionMode,
        branch: draft.branch,
        worktreePath: draft.worktreePath,
        createdAt: draft.createdAt,
      },
      ...prepareWorktree,
    },
    createdAt: queued.createdAt,
  };
}

/** The send went through (now or earlier): clear the record and hand the draft to its thread. */
export function completeCloudQueuedSend(
  draftId: string,
  environmentId: EnvironmentId,
  threadId: DraftSessionState["threadId"],
): void {
  // Promote first: clearing the record writes through, so other windows read both at once.
  markPromotedDraftThreadByRef(scopeThreadRef(environmentId, threadId));
  writeDraftCloudQueuedSend(draftId, null);
}

export async function dispatchCloudQueuedSend(input: {
  readonly draftId: string;
  readonly messageId: string;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly projectCwd: string | null;
  readonly startTurn: StartCloudQueuedTurn;
}): Promise<"sent" | "failed" | "skipped"> {
  if (isCloudQueuedSendDispatching(input.messageId)) return "skipped";
  const claim = holdCloudQueuedSendClaim(input.messageId);
  if (claim === null) return "skipped";
  setCloudQueuedSendDispatching(input.messageId, true);
  try {
    // Under the claim the persisted record decides; a stale copy here adopts it and stops.
    const persisted = confirmPersistedCloudQueuedSend(input.draftId, input.messageId);
    if (persisted === null || persisted.failureMessage !== undefined) return "skipped";
    const queued = getDraftCloudQueuedSend(input.draftId);
    const store = useComposerDraftStore.getState();
    const draftId = DraftId.make(input.draftId);
    const draft = store.getDraftSession(draftId);
    if (queued === null || queued.messageId !== input.messageId || draft === null) {
      return "skipped";
    }
    if (queued.failureMessage !== undefined || draft.promotedTo) return "skipped";
    store.setDraftThreadContext(draftId, {
      projectRef: scopeProjectRef(input.environmentId, input.projectId),
      environmentSelection: "manual",
      loadBalancedEnvironmentId: null,
    });
    const result = await input.startTurn({
      environmentId: input.environmentId,
      input: buildCloudQueuedTurnInput({
        queued,
        draft,
        projectId: input.projectId,
        projectCwd: input.projectCwd,
      }),
    });
    if (result._tag === "Failure") {
      failDraftCloudQueuedSend(
        input.draftId,
        queued.messageId,
        "The message could not be sent to the cloud session.",
        true,
      );
      return "failed";
    }
    completeCloudQueuedSend(input.draftId, input.environmentId, draft.threadId);
    return "sent";
  } finally {
    setCloudQueuedSendDispatching(input.messageId, false);
    claim.release();
  }
}
