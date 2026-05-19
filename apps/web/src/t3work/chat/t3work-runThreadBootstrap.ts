import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import {
  recordThreadBootstrapEvent,
  type ThreadBootstrapAction,
} from "~/t3work/chat/t3work-threadBootstrapInstrumentation";
import {
  appendContextAttachmentsToPrompt,
  prepareThreadContextAttachments,
} from "~/t3work/chat/t3work-prepareThreadContextAttachments";
import type { ThreadBootstrapDispatchState } from "~/t3work/chat/t3work-threadBootstrapPlan";
import { useT3WorkAddToChatStore } from "~/t3work/t3work-addToChatStore";

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
  createdAt,
  shouldEnsureProject,
  action,
  state,
  onInitialUserMessageSent,
}: RunThreadBootstrapInput) {
  if (projectWorkspaceRoot && shouldEnsureProject) {
    state.projectEnsured = true;
    recordThreadBootstrapEvent("thread-bootstrap.project-create.start", {
      threadId,
      canonicalProjectId,
      projectWorkspaceRoot,
    });

    try {
      await backend.dispatchCommand({
        type: "project.create",
        commandId: crypto.randomUUID() as any,
        projectId: canonicalProjectId as any,
        title: projectTitle,
        workspaceRoot: projectWorkspaceRoot,
        createWorkspaceRootIfMissing: true,
        defaultModelSelection: kickoffModelSelection,
        createdAt,
      });
      recordThreadBootstrapEvent("thread-bootstrap.project-create.success", {
        threadId,
        canonicalProjectId,
      });
    } catch {
      recordThreadBootstrapEvent("thread-bootstrap.project-create.ignored-error", {
        threadId,
        canonicalProjectId,
      });
      // Duplicate project errors are expected if it already exists.
    }
  }

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
    const bootstrapMessage = appendContextAttachmentsToPrompt(
      initialUserMessage,
      preparedContextAttachments,
    );

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

  state.threadCreateSent = true;
  recordThreadBootstrapEvent("thread-bootstrap.thread-create.start", {
    environmentId,
    threadId,
    canonicalProjectId,
    title,
  });

  await backend.dispatchCommand({
    type: "thread.create",
    commandId: crypto.randomUUID() as any,
    threadId: threadId as any,
    projectId: canonicalProjectId as any,
    title,
    modelSelection: kickoffModelSelection,
    runtimeMode: kickoffRuntimeMode,
    interactionMode: kickoffInteractionMode,
    branch: null,
    worktreePath: null,
    createdAt,
  });
  recordThreadBootstrapEvent("thread-bootstrap.thread-create.success", {
    environmentId,
    threadId,
    canonicalProjectId,
  });
}
