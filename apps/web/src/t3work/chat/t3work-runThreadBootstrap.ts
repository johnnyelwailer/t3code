import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import { ensureThreadBootstrapProject } from "~/t3work/chat/t3work-runThreadBootstrapHelpers";
import {
  dispatchThreadBootstrapCreateWithRecovery,
  runThreadBootstrapKickoff,
} from "~/t3work/chat/t3work-runThreadBootstrapKickoff";
import { type ThreadBootstrapAction } from "~/t3work/chat/t3work-threadBootstrapInstrumentation";
import type { ThreadBootstrapDispatchState } from "~/t3work/chat/t3work-threadBootstrapPlan";
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
    await runThreadBootstrapKickoff({
      backend,
      action,
      state,
      environmentId,
      threadId,
      canonicalProjectId,
      title,
      initialUserMessage,
      kickoffModelSelection,
      kickoffRuntimeMode,
      kickoffInteractionMode,
      kickoffWorkflow,
      toolContext,
      createdAt,
      onInitialUserMessageSent,
    });
    return;
  }

  await dispatchThreadBootstrapCreateWithRecovery({
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
