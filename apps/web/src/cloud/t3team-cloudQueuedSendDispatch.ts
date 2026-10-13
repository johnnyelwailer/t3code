/**
 * Delivers one queued cloud send: retargets the draft at the cloud machine, launches its thread
 * with the prepared first message, and promotes the draft. Exactly once:
 *  - here and in other windows: the dispatching set and the outbox's cross-tab claim (Cancel too);
 *  - the server: a command id derived from the message id, so a replay after a crash, a reload
 *    or a retry returns the first launch's receipt instead of launching again.
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
import { acquireOutboxDispatch, releaseOutboxDispatch } from "~/t3team/outbox/t3team-outboxStorage";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import {
  cloudQueuedSendClaimKey,
  failDraftCloudQueuedSend,
  getDraftCloudQueuedSend,
  isCloudQueuedSendDispatching,
  setCloudQueuedSendDispatching,
  writeDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";

const CLOUD_QUEUED_SEND_DISPATCH_FAILED_MESSAGE =
  "The message could not be sent to the cloud session.";

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
  writeDraftCloudQueuedSend(draftId, null);
  markPromotedDraftThreadByRef(scopeThreadRef(environmentId, threadId));
}

export async function dispatchCloudQueuedSend(input: {
  readonly draftId: string;
  readonly messageId: string;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly projectCwd: string | null;
  readonly startTurn: StartCloudQueuedTurn;
}): Promise<"sent" | "failed" | "skipped"> {
  const claimKey = cloudQueuedSendClaimKey(input.messageId);
  if (isCloudQueuedSendDispatching(input.messageId) || !acquireOutboxDispatch(claimKey)) {
    return "skipped";
  }
  setCloudQueuedSendDispatching(input.messageId, true);
  try {
    // Re-read under the claim: another window may have sent or cancelled it meanwhile.
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
        CLOUD_QUEUED_SEND_DISPATCH_FAILED_MESSAGE,
        true,
      );
      return "failed";
    }
    completeCloudQueuedSend(input.draftId, input.environmentId, draft.threadId);
    return "sent";
  } finally {
    setCloudQueuedSendDispatching(input.messageId, false);
    releaseOutboxDispatch(claimKey);
  }
}
