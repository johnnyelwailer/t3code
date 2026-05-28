import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import {
  recordThreadBootstrapEvent,
  type ThreadBootstrapAction,
} from "~/t3work/chat/t3work-threadBootstrapInstrumentation";
import {
  dispatchThreadBootstrapCreate,
  ensureThreadBootstrapProject,
} from "~/t3work/chat/t3work-runThreadBootstrapHelpers";
import {
  appendContextAttachmentsToPrompt,
  prepareThreadContextAttachments,
} from "~/t3work/chat/t3work-prepareThreadContextAttachments";
import type { ThreadBootstrapDispatchState } from "~/t3work/chat/t3work-threadBootstrapPlan";
import { useT3WorkAddToChatStore } from "~/t3work/t3work-addToChatStore";
import { toProjectRecipeWorkflowLaunch } from "~/t3work/chat/t3work-recipeWorkflowLaunch";
import type { T3workTurnToolContext } from "~/t3work/t3work-threadToolContext";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";

type ThreadBootstrapBackend = BackendApi;

type RunThreadBootstrapInput = {
  backend: ThreadBootstrapBackend;
  environmentId: string;
  threadId: string;
  projectTitle: string;
  projectWorkspaceRoot: string | undefined;
  canonicalProjectId: string;
  title: string;
  initialUserMessage: string | undefined;
  kickoffModelSelection: ModelSelection;
  kickoffRuntimeMode: RuntimeMode;
  kickoffInteractionMode: ProviderInteractionMode;
  kickoffWorkflow?: T3workKickoffWorkflow;
  toolContext?: T3workTurnToolContext;
  createdAt: string;
  shouldEnsureProject: boolean;
  action: ThreadBootstrapAction;
  state: ThreadBootstrapDispatchState;
  onInitialUserMessageSent: (() => void) | undefined;
};

export async function runThreadBootstrap({
  backend,
  environmentId,
  threadId,
  projectTitle,
  projectWorkspaceRoot,
  canonicalProjectId,
  title,
  initialUserMessage,
  kickoffModelSelection,
  kickoffRuntimeMode,
  kickoffInteractionMode,
  kickoffWorkflow,
  toolContext,
  createdAt,
  shouldEnsureProject,
  action,
  state,
  onInitialUserMessageSent,
}: RunThreadBootstrapInput) {
  await ensureThreadBootstrapProject({
    backend,
    projectWorkspaceRoot,
    shouldEnsureProject,
    state,
    threadId,
    canonicalProjectId,
    projectTitle,
    kickoffModelSelection,
    createdAt,
  });

  if (action === "kickoff" && initialUserMessage) {
    state.kickoffSent = true;
    recordThreadBootstrapEvent("thread-bootstrap.kickoff.start", {
      environmentId,
      threadId,
      canonicalProjectId,
      title,
    });

    const preparedContextAttachments = await prepareThreadContextAttachments({
      threadId,
      backend,
    });
    await backend.syncThreadToolContext({
      threadId,
      toolContext: toolContext ?? null,
    });
    const bootstrapMessage = appendContextAttachmentsToPrompt(
      initialUserMessage,
      preparedContextAttachments,
    );

    if (kickoffWorkflow?.kind === "recipe") {
      await dispatchThreadBootstrapCreate({
        backend,
        action,
        state,
        environmentId,
        threadId,
        canonicalProjectId,
        title,
        kickoffModelSelection,
        kickoffRuntimeMode,
        kickoffInteractionMode,
        createdAt,
      });

      await backend.launchRecipeWorkflow({
        threadId,
        kickoffMessage: bootstrapMessage,
        titleSeed: title,
        createdAt,
        modelSelection: {
          instanceId: String(kickoffModelSelection.instanceId),
          model: kickoffModelSelection.model,
        },
        runtimeMode: kickoffRuntimeMode,
        interactionMode: kickoffInteractionMode,
        launch: toProjectRecipeWorkflowLaunch(kickoffWorkflow),
      });
      recordThreadBootstrapEvent("thread-bootstrap.kickoff.success", {
        environmentId,
        threadId,
        canonicalProjectId,
      });
      if (preparedContextAttachments.length > 0) {
        useT3WorkAddToChatStore.getState().clearThreadAttachments(threadId);
      }
      onInitialUserMessageSent?.();
      return;
    }

    await backend.dispatchCommand({
      type: "thread.turn.start",
      commandId: crypto.randomUUID() as any,
      threadId: threadId as any,
      message: {
        messageId: crypto.randomUUID() as any,
        role: "user",
        text: bootstrapMessage,
        attachments: [],
      },
      modelSelection: kickoffModelSelection,
      titleSeed: title,
      runtimeMode: kickoffRuntimeMode,
      interactionMode: kickoffInteractionMode,
      bootstrap: {
        createThread: {
          projectId: canonicalProjectId as any,
          title,
          modelSelection: kickoffModelSelection,
          runtimeMode: kickoffRuntimeMode,
          interactionMode: kickoffInteractionMode,
          branch: null,
          worktreePath: null,
          createdAt,
        },
      },
      createdAt,
    });
    recordThreadBootstrapEvent("thread-bootstrap.kickoff.success", {
      environmentId,
      threadId,
      canonicalProjectId,
    });
    if (preparedContextAttachments.length > 0) {
      useT3WorkAddToChatStore.getState().clearThreadAttachments(threadId);
    }
    onInitialUserMessageSent?.();
    return;
  }

  await dispatchThreadBootstrapCreate({
    backend,
    action,
    state,
    environmentId,
    threadId,
    canonicalProjectId,
    title,
    kickoffModelSelection,
    kickoffRuntimeMode,
    kickoffInteractionMode,
    createdAt,
  });
}
