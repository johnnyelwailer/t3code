import { withT3TeamMessageExtContext } from "@t3tools/contracts";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import {
  appendContextAttachmentsToPrompt,
  prepareThreadContextAttachments,
} from "~/t3team/chat/t3team-prepareThreadContextAttachments";
import {
  releaseRecipeWorkflowLaunchClaim,
  tryClaimRecipeWorkflowLaunch,
} from "~/t3team/chat/t3team-recipeLaunchDedup";
import { toProjectRecipeWorkflowLaunch } from "~/t3team/chat/t3team-recipeWorkflowLaunch";
import {
  recordThreadBootstrapEvent,
  type ThreadBootstrapAction,
} from "~/t3team/chat/t3team-threadBootstrapInstrumentation";
import {
  ThreadBootstrapProgressTracker,
  type ThreadBootstrapProgress,
} from "~/t3team/chat/t3team-threadBootstrapProgress";
import { dispatchThreadBootstrapCreateWithRecovery } from "~/t3team/chat/t3team-threadBootstrapCreate";
import { runThreadBootstrapPlainStart } from "~/t3team/chat/t3team-runThreadBootstrapPlainStart";
import type { ThreadBootstrapDispatchState } from "~/t3team/chat/t3team-threadBootstrapPlan";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import { type T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import { buildContextAttachmentMessageExt } from "~/t3team/t3team-messageContextAttachments";
import type { T3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

type RunThreadBootstrapKickoffInput = {
  backend: BackendApi;
  action: ThreadBootstrapAction;
  state: ThreadBootstrapDispatchState;
  environmentId: string;
  threadId: string;
  canonicalProjectId: string;
  title: string;
  initialUserMessage: string;
  kickoffModelSelection: ModelSelection;
  kickoffRuntimeMode: RuntimeMode;
  kickoffInteractionMode: ProviderInteractionMode;
  kickoffBranch: string | null;
  kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
  toolContext: T3TeamTurnToolContext | undefined;
  createdAt: string;
  onInitialUserMessageSent: (() => void) | undefined;
  /** A retry into a shell a failed launch left behind: send the kickoff without creating it. */
  serverThreadExists?: boolean;
  /** Reports per-step progress to the view (in-thread launch progress). */
  reportProgress?: (progress: ThreadBootstrapProgress) => void;
};

type WorkflowBackedRecipe = T3TeamKickoffWorkflow & { readonly workflowPath: string };

function hasWorkflowLaunchPath(
  workflow: T3TeamKickoffWorkflow | undefined,
): workflow is WorkflowBackedRecipe {
  return workflow?.kind === "recipe" && typeof workflow.workflowPath === "string";
}

export async function runThreadBootstrapKickoff(input: RunThreadBootstrapKickoffInput) {
  const tracker = new ThreadBootstrapProgressTracker({
    progress: {
      steps: [
        { id: "create", status: "pending" },
        ...(threadKickoffHasContext(input.threadId)
          ? [{ id: "context" as const, status: "pending" as const }]
          : []),
        { id: "launch", status: "pending" },
      ],
    },
    report: input.reportProgress,
  });

  input.state.kickoffSent = true;
  recordThreadBootstrapEvent("thread-bootstrap.kickoff.start", {
    environmentId: input.environmentId,
    threadId: input.threadId,
    canonicalProjectId: input.canonicalProjectId,
    title: input.title,
  });

  // The durable thread comes FIRST on the workflow path: the context sync and the tool-context
  // sync are enrichment that all talks to the network, so creating the thread behind them meant a
  // slow attachment sync left the user on "Creating conversation…" with no thread and no run.
  if (input.serverThreadExists === true) {
    // A retry into a shell a failed launch left behind: the conversation already exists, so the
    // create step reports done without dispatching.
    tracker.complete("create");
  } else if (hasWorkflowLaunchPath(input.kickoffWorkflow)) {
    await dispatchThreadBootstrapCreateWithRecovery({
      backend: input.backend,
      action: input.action,
      state: input.state,
      environmentId: input.environmentId,
      threadId: input.threadId,
      canonicalProjectId: input.canonicalProjectId,
      title: input.title,
      kickoffModelSelection: input.kickoffModelSelection,
      kickoffRuntimeMode: input.kickoffRuntimeMode,
      kickoffInteractionMode: input.kickoffInteractionMode,
      kickoffBranch: input.kickoffBranch,
      createdAt: input.createdAt,
      tracker,
    });
  }

  let preparedContextAttachments: ReadonlyArray<T3TeamContextAttachment> = [];
  if (tracker.current.steps.some((step) => step.id === "context")) {
    tracker.begin("context");
    try {
      preparedContextAttachments = await prepareThreadContextAttachments({
        threadId: input.threadId,
        backend: input.backend,
      });
      tracker.complete("context");
    } catch (error) {
      tracker.fail("context", error);
      throw error;
    }
  }

  await input.backend.syncThreadToolContext({
    threadId: input.threadId,
    toolContext: input.toolContext ?? null,
  });
  const bootstrapMessage = appendContextAttachmentsToPrompt(
    input.initialUserMessage,
    preparedContextAttachments,
  );
  const messageExt = buildContextAttachmentMessageExt(preparedContextAttachments, {
    displayText: input.initialUserMessage,
  });

  if (hasWorkflowLaunchPath(input.kickoffWorkflow)) {
    tracker.begin("launch");
    try {
      // Claim the launch so a single Quick Start send can't spawn two runs (the composer's
      // turn-start override can reach launchRecipeWorkflow for the same thread). First claim
      // wins; a throw releases the claim, otherwise retry recreates the shell and skips it.
      if (tryClaimRecipeWorkflowLaunch(input.threadId)) {
        try {
          await input.backend.launchRecipeWorkflow({
            threadId: input.threadId,
            kickoffMessage: bootstrapMessage,
            titleSeed: input.title,
            createdAt: input.createdAt,
            modelSelection: {
              instanceId: String(input.kickoffModelSelection.instanceId),
              model: input.kickoffModelSelection.model,
            },
            runtimeMode: input.kickoffRuntimeMode,
            interactionMode: input.kickoffInteractionMode,
            launch: toProjectRecipeWorkflowLaunch(input.kickoffWorkflow),
          });
        } catch (error) {
          releaseRecipeWorkflowLaunchClaim(input.threadId);
          throw error;
        }
      }
      tracker.complete("launch");
    } catch (error) {
      tracker.fail("launch", error);
      throw error;
    }
    finalizeThreadBootstrapKickoff(input, preparedContextAttachments.length);
    return;
  }

  const messageContext = messageExt ? withT3TeamMessageExtContext(messageExt) : undefined;
  await runThreadBootstrapPlainStart({
    backend: input.backend,
    threadId: input.threadId,
    canonicalProjectId: input.canonicalProjectId,
    title: input.title,
    message: bootstrapMessage,
    messageContext,
    kickoffModelSelection: input.kickoffModelSelection,
    kickoffRuntimeMode: input.kickoffRuntimeMode,
    kickoffInteractionMode: input.kickoffInteractionMode,
    kickoffBranch: input.kickoffBranch,
    createdAt: input.createdAt,
    serverThreadExists: input.serverThreadExists === true,
    tracker,
  });
  finalizeThreadBootstrapKickoff(input, preparedContextAttachments.length);
}

function threadKickoffHasContext(threadId: string): boolean {
  return (
    (useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId[threadId] ?? []).length > 0
  );
}

function finalizeThreadBootstrapKickoff(
  input: RunThreadBootstrapKickoffInput,
  preparedContextAttachmentCount: number,
) {
  recordThreadBootstrapEvent("thread-bootstrap.kickoff.success", {
    environmentId: input.environmentId,
    threadId: input.threadId,
    canonicalProjectId: input.canonicalProjectId,
  });
  if (preparedContextAttachmentCount > 0) {
    useT3TeamAddToChatStore.getState().clearThreadAttachments(input.threadId);
  }
  input.onInitialUserMessageSent?.();
}
