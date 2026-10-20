import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { ensureThreadBootstrapProject } from "~/t3team/chat/t3team-runThreadBootstrapHelpers";
import { runThreadBootstrapKickoff } from "~/t3team/chat/t3team-runThreadBootstrapKickoff";
import { dispatchThreadBootstrapCreateWithRecovery } from "~/t3team/chat/t3team-threadBootstrapCreate";
import { type ThreadBootstrapAction } from "~/t3team/chat/t3team-threadBootstrapInstrumentation";
import {
  ThreadBootstrapProgressTracker,
  type ThreadBootstrapProgress,
} from "~/t3team/chat/t3team-threadBootstrapProgress";
import type { ThreadBootstrapDispatchState } from "~/t3team/chat/t3team-threadBootstrapPlan";
import type { T3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

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
  kickoffBranch: string | null;
  kickoffWorkflow?: T3TeamKickoffWorkflow;
  toolContext?: T3TeamTurnToolContext;
  createdAt: string;
  shouldEnsureProject: boolean;
  action: ThreadBootstrapAction;
  state: ThreadBootstrapDispatchState;
  onInitialUserMessageSent: (() => void) | undefined;
  serverThreadExists?: boolean;
  /** Reports per-step progress to the view (in-thread launch progress). */
  onProgress?: (progress: ThreadBootstrapProgress) => void;
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
  kickoffBranch,
  kickoffWorkflow,
  toolContext,
  createdAt,
  shouldEnsureProject,
  action,
  state,
  onInitialUserMessageSent,
  serverThreadExists,
  onProgress,
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

  if (
    action === "kickoff" &&
    initialUserMessage !== undefined &&
    (initialUserMessage !== "" || kickoffWorkflow !== undefined)
  ) {
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
      kickoffBranch,
      kickoffWorkflow,
      toolContext,
      createdAt,
      onInitialUserMessageSent,
      ...(serverThreadExists === true ? { serverThreadExists } : {}),
      ...(onProgress ? { reportProgress: onProgress } : {}),
    });
    return;
  }

  const tracker = new ThreadBootstrapProgressTracker({
    progress: { steps: [{ id: "create", status: "pending" }] },
    report: onProgress,
  });
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
    kickoffBranch,
    createdAt,
    tracker,
  });
}
