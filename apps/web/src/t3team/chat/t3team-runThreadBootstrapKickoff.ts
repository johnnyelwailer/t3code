import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { isDuplicateThreadCreateError } from "~/t3team/chat/t3team-duplicateThreadCreateError";
import { dispatchThreadBootstrapCreate } from "~/t3team/chat/t3team-runThreadBootstrapHelpers";
import {
  appendContextAttachmentsToPrompt,
  prepareThreadContextAttachments,
} from "~/t3team/chat/t3team-prepareThreadContextAttachments";
import { tryClaimRecipeWorkflowLaunch } from "~/t3team/chat/t3team-recipeLaunchDedup";
import { toProjectRecipeWorkflowLaunch } from "~/t3team/chat/t3team-recipeWorkflowLaunch";
import {
  recordThreadBootstrapEvent,
  type ThreadBootstrapAction,
} from "~/t3team/chat/t3team-threadBootstrapInstrumentation";
import type { ThreadBootstrapDispatchState } from "~/t3team/chat/t3team-threadBootstrapPlan";
import { randomUUID } from "~/lib/utils";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import { buildContextAttachmentMessageExt } from "~/t3team/t3team-messageContextAttachments";
import type { T3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

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
  kickoffBranch: string | null;
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
  kickoffBranch: string | null;
  kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
  toolContext: T3TeamTurnToolContext | undefined;
  createdAt: string;
  onInitialUserMessageSent: (() => void) | undefined;
};

type WorkflowBackedRecipe = T3TeamKickoffWorkflow & { readonly workflowPath: string };

function hasWorkflowLaunchPath(
  workflow: T3TeamKickoffWorkflow | undefined,
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
    useT3TeamAddToChatStore.getState().clearThreadAttachments(input.threadId);
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

  // The durable thread comes FIRST on the workflow path.
  //
  // Everything between here and the launch — the context-attachment sync, the tool-context sync — is
  // enrichment, and all of it talks to the network. Creating the thread behind those meant one slow
  // or never-settling attachment sync left the user on "Creating conversation…" with no thread, no
  // run, and nothing thrown: the two calls sit before the create, so a hang there is indistinguishable
  // from a launch that is merely slow. On the turn path there is nothing to hoist — the create rides
  // inside `thread.turn.start`'s own `bootstrap.createThread`.
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
      kickoffBranch: input.kickoffBranch,
      createdAt: input.createdAt,
    });
  }

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
  const t3teamMessageExt = buildContextAttachmentMessageExt(preparedContextAttachments, {
    displayText: input.initialUserMessage,
  });

  if (hasWorkflowLaunchPath(input.kickoffWorkflow)) {
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
      ...(t3teamMessageExt ? { t3teamExt: t3teamMessageExt } : {}),
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
        branch: input.kickoffBranch,
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
