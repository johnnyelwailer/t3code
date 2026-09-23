import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { launchPendingRecipeWorkflowTurn } from "~/t3team/chat/t3team-recipeWorkflowLaunch";
import type { SubmitThreadStagedComposerAction } from "~/t3team/chat/t3team-useThreadStagedComposerAction";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

export type DispatchTurnStartInput = {
  threadId: string;
  messageId: string;
  messageText: string;
  modelSelection: ModelSelection;
  titleSeed: string;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  createdAt: string;
  hasAttachments: boolean;
};

export async function dispatchTurnStart(
  turnStart: DispatchTurnStartInput,
  deps: {
    backend: BackendApi | null | undefined;
    kickoffPending: boolean | undefined;
    kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
    hasServerLaunchActivity: boolean;
    submitStagedAction: SubmitThreadStagedComposerAction;
    waitingForRecipeInput: boolean;
  },
): Promise<false | "resolved-input" | boolean> {
  const {
    backend,
    kickoffPending,
    kickoffWorkflow,
    hasServerLaunchActivity,
    submitStagedAction,
    waitingForRecipeInput,
  } = deps;
  if (!backend) {
    return false;
  }

  // Answering a workflow's pending askUser: post the reply as a real (visible) message via the
  // resolve route. The workflow-engine reactor resolves the parked user.input from that message
  // event — so the reply renders normally, no stray agent turn starts, and there is a single
  // resolution path.
  if (waitingForRecipeInput) {
    await backend.resolveWorkflowInput({
      threadId: turnStart.threadId,
      text: turnStart.messageText,
      messageId: turnStart.messageId,
    });
    // "resolved-input" tells ChatView this send posted a message with no turn lifecycle, so it
    // should clear its optimistic busy state itself (no turn event will arrive to clear it).
    return "resolved-input" as const;
  }

  // An action preselected from the page (the Description header's `Rewrite`) runs on THIS send —
  // that is the whole contract of staging, so it wins over a plain turn.
  const staged = submitStagedAction({
    backend,
    threadId: turnStart.threadId,
    composerText: turnStart.messageText,
    modelSelection: turnStart.modelSelection,
    runtimeMode: turnStart.runtimeMode,
    interactionMode: turnStart.interactionMode,
  });
  if (staged) return staged;

  return launchPendingRecipeWorkflowTurn({
    backend,
    threadId: turnStart.threadId,
    kickoffPending,
    kickoffWorkflow,
    hasServerLaunchActivity,
    kickoffMessage: turnStart.messageText,
    titleSeed: turnStart.titleSeed,
    createdAt: turnStart.createdAt,
    modelSelection: turnStart.modelSelection,
    runtimeMode: turnStart.runtimeMode,
    interactionMode: turnStart.interactionMode,
    hasAttachments: turnStart.hasAttachments,
  });
}
