import {
  ProjectId,
  ThreadId,
  type ModelSelection,
  type ProviderInteractionMode,
  type RuntimeMode,
} from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import {
  recordThreadBootstrapEvent,
  type ThreadBootstrapAction,
} from "~/t3team/chat/t3team-threadBootstrapInstrumentation";
import type { ThreadBootstrapDispatchState } from "~/t3team/chat/t3team-threadBootstrapPlan";

export async function ensureThreadBootstrapProject(input: {
  backend: BackendApi;
  projectWorkspaceRoot: string | undefined;
  shouldEnsureProject: boolean;
  state: ThreadBootstrapDispatchState;
  threadId: string;
  canonicalProjectId: string;
  projectTitle: string;
  kickoffModelSelection: ModelSelection;
  createdAt: string;
}) {
  // Thread invocation must NOT scaffold the workspace. Project-setup scaffolding writes
  // agent-instruction files (AGENTS.md/CLAUDE.md) and the .t3team setup tree into the project
  // root — which pollutes a user's own repository when the project is a loose local workspace.
  // Scaffolding is owned by the work-project create + sync paths (gated on isWorkProject); thread
  // start only ensures the project record exists. The workspace directory itself is created by the
  // `project.create` dispatch below via `createWorkspaceRootIfMissing`.
  if (!input.projectWorkspaceRoot || !input.shouldEnsureProject) {
    return;
  }

  input.state.projectEnsured = true;
  recordThreadBootstrapEvent("thread-bootstrap.project-create.start", {
    threadId: input.threadId,
    canonicalProjectId: input.canonicalProjectId,
    projectWorkspaceRoot: input.projectWorkspaceRoot,
  });

  try {
    await input.backend.orchestration.createProject({
      projectId: ProjectId.make(input.canonicalProjectId),
      title: input.projectTitle,
      workspaceRoot: input.projectWorkspaceRoot,
      createWorkspaceRootIfMissing: true,
      defaultModelSelection: input.kickoffModelSelection,
      source: { provider: "local" },
    });
    recordThreadBootstrapEvent("thread-bootstrap.project-create.success", {
      threadId: input.threadId,
      canonicalProjectId: input.canonicalProjectId,
    });
  } catch {
    recordThreadBootstrapEvent("thread-bootstrap.project-create.ignored-error", {
      threadId: input.threadId,
      canonicalProjectId: input.canonicalProjectId,
    });
  }
}

export async function dispatchThreadBootstrapCreate(input: {
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
}) {
  input.state.threadCreateSent = true;
  recordThreadBootstrapEvent("thread-bootstrap.thread-create.start", {
    environmentId: input.environmentId,
    threadId: input.threadId,
    canonicalProjectId: input.canonicalProjectId,
    title: input.title,
  });

  await input.backend.orchestration.createThread({
    threadId: ThreadId.make(input.threadId),
    projectId: ProjectId.make(input.canonicalProjectId),
    title: input.title,
    modelSelection: input.kickoffModelSelection,
    runtimeMode: input.kickoffRuntimeMode,
    interactionMode: input.kickoffInteractionMode,
    branch: input.kickoffBranch,
    worktreePath: null,
  });
  recordThreadBootstrapEvent("thread-bootstrap.thread-create.success", {
    environmentId: input.environmentId,
    threadId: input.threadId,
    canonicalProjectId: input.canonicalProjectId,
    title: input.title,
  });
}
