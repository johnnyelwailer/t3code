import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import {
  dispatchThreadBootstrapCreate,
  isDuplicateThreadCreateError,
} from "~/t3work/chat/t3work-runThreadBootstrapHelpers";
import {
  appendContextAttachmentsToPrompt,
  prepareThreadContextAttachments,
} from "~/t3work/chat/t3work-prepareThreadContextAttachments";
import { tryClaimRecipeWorkflowLaunch } from "~/t3work/chat/t3work-recipeLaunchDedup";
import { toProjectRecipeWorkflowLaunch } from "~/t3work/chat/t3work-recipeWorkflowLaunch";
import {
  recordThreadBootstrapEvent,
  type ThreadBootstrapAction,
} from "~/t3work/chat/t3work-threadBootstrapInstrumentation";
import type { ThreadBootstrapDispatchState } from "~/t3work/chat/t3work-threadBootstrapPlan";
import { randomUUID } from "~/lib/utils";
import { useT3WorkAddToChatStore } from "~/t3work/t3work-addToChatStore";
import type { T3workTurnToolContext } from "~/t3work/t3work-threadToolContext";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";

type DispatchThreadBootstrapCreateWithRecoveryInput = {
  backend: BackendApi;
  action: ThreadBootstrapAction;
  state: ThreadBootstrapDispatchState;
  environmentId: string;
  threadId: string;
  canonicalProjectId: string;
  title: string;
  kickoffModelSelection: ModelSelection;
  kickoffRuntimeMode: RuntimeMode;
  kickoffInteractionMode: ProviderInteractionMode;
  createdAt: string;
};

export async function dispatchThreadBootstrapCreateWithRecovery(
  input: DispatchThreadBootstrapCreateWithRecoveryInput,
) {
  try {
    await dispatchThreadBootstrapCreate(input);
  } catch (error) {
    if (!isDuplicateThreadCreateError(error)) {
      throw error;
    }
  }
}

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
  kickoffWorkflow: T3workKickoffWorkflow | undefined;
  toolContext: T3workTurnToolContext | undefined;
  createdAt: string;
  onInitialUserMessageSent: (() => void) | undefined;
};

type WorkflowBackedRecipe = T3workKickoffWorkflow & { readonly workflowPath: string };

function hasWorkflowLaunchPath(
  workflow: T3workKickoffWorkflow | undefined,
): workflow is WorkflowBackedRecipe {
  return workflow?.kind === "recipe" && typeof workflow.workflowPath === "string";
}

function finalizeThreadBootstrapKickoff(input: {
  environmentId: string;
  threadId: string;
  canonicalProjectId: string;
  preparedContextAttachmentCount: number;
  onInitialUserMessageSent: (() => void) | undefined;
}) {
  recordThreadBootstrapEvent("thread-bootstrap.kickoff.success", {
    environmentId: input.environmentId,
    threadId: input.threadId,
    canonicalProjectId: input.canonicalProjectId,
  });
  if (input.preparedContextAttachmentCount > 0) {
    useT3WorkAddToChatStore.getState().clearThreadAttachments(input.threadId);
  }
  input.onInitialUserMessageSent?.();
}

export async function runThreadBootstrapKickoff(input: RunThreadBootstrapKickoffInput) {
  input.state.kickoffSent = true;
  recordThreadBootstrapEvent("thread-bootstrap.kickoff.start", {
    environmentId: input.environmentId,
    threadId: input.threadId,
    canonicalProjectId: input.canonicalProjectId,
    title: input.title,
  });

  const preparedContextAttachments = await prepareThreadContextAttachments({
    threadId: input.threadId,
    backend: input.backend,
  });
  await input.backend.syncThreadToolContext({
    threadId: input.threadId,
    toolContext: input.toolContext ?? null,
  });
  const bootstrapMessage = appendContextAttachmentsToPrompt(
    input.initialUserMessage,
    preparedContextAttachments,
  );

  if (hasWorkflowLaunchPath(input.kickoffWorkflow)) {
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
      createdAt: input.createdAt,
    });

    // Claim the launch so a single Quick Start send can't spawn two runs (the composer's
    // turn-start override can reach launchRecipeWorkflow for the same thread). First claim wins.
    if (tryClaimRecipeWorkflowLaunch(input.threadId)) {
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
    }
    finalizeThreadBootstrapKickoff({
      environmentId: input.environmentId,
      threadId: input.threadId,
      canonicalProjectId: input.canonicalProjectId,
      preparedContextAttachmentCount: preparedContextAttachments.length,
      onInitialUserMessageSent: input.onInitialUserMessageSent,
    });
    return;
  }

  await input.backend.dispatchCommand({
    type: "thread.turn.start",
    commandId: randomUUID() as any,
    threadId: input.threadId as any,
    message: {
      messageId: randomUUID() as any,
      role: "user",
      text: bootstrapMessage,
      attachments: [],
    },
    modelSelection: input.kickoffModelSelection,
    titleSeed: input.title,
    runtimeMode: input.kickoffRuntimeMode,
    interactionMode: input.kickoffInteractionMode,
    bootstrap: {
      createThread: {
        projectId: input.canonicalProjectId as any,
        title: input.title,
        modelSelection: input.kickoffModelSelection,
        runtimeMode: input.kickoffRuntimeMode,
        interactionMode: input.kickoffInteractionMode,
        branch: null,
        worktreePath: null,
        createdAt: input.createdAt,
      },
    },
    createdAt: input.createdAt,
  });
  finalizeThreadBootstrapKickoff({
    environmentId: input.environmentId,
    threadId: input.threadId,
    canonicalProjectId: input.canonicalProjectId,
    preparedContextAttachmentCount: preparedContextAttachments.length,
    onInitialUserMessageSent: input.onInitialUserMessageSent,
  });
}
