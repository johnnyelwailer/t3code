import type { ProjectShellProject } from "@t3tools/project-context";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import {
  createThreadChatTurnToolContext,
  resolveSelectedToolIds,
} from "~/t3team/chat/t3team-useThreadChatTurnToolContext";
import { startThreadBootstrapRun } from "~/t3team/chat/t3team-startThreadBootstrapRun";
import { readThreadBootstrapDispatchState } from "~/t3team/chat/t3team-threadBootstrapDispatchRegistry";
import { publishExternalThreadBootstrapRun } from "~/t3team/chat/t3team-threadBootstrapExternalRun";
import { resolveThreadBootstrapKickoffDefaults } from "~/t3team/chat/t3team-threadBootstrapKickoffDefaults";
import { planThreadBootstrap } from "~/t3team/chat/t3team-threadBootstrapPlan";
import { resolveCanonicalProjectIdForWorkspaceRoot } from "~/t3team/hooks/t3team-threadProjectResolution";
import type { ProjectThread } from "~/t3team/t3team-types";
import type { Project } from "~/types";

/**
 * Sends a plain-text kickoff's first message the moment the user presses Send: one
 * `thread.turn.start` carrying `bootstrap.createThread` and the text, the same atomic call the
 * new-thread panel makes, so a failed call leaves no thread behind and a successful one never
 * depends on the thread's chat mounting.
 *
 * The run claims the same per-thread dispatch state the mounted chat plans from, so that chat later
 * plans `none` instead of sending a second time, and reports through the external-run store so its
 * launch panel follows this call. Returns false, sending nothing, when something the dispatch needs
 * is not known yet; the mounted chat then delivers the message as it always has.
 */
export function sendKickoffAtClick(input: {
  backend: BackendApi | null | undefined;
  environmentId: string | null | undefined;
  project: ProjectShellProject | undefined;
  thread: ProjectThread;
  liveProjects: ReadonlyArray<Project>;
  markKickoffConsumed: (threadId: string) => void;
}): boolean {
  const { backend, environmentId, project, thread, liveProjects } = input;
  const message = thread.kickoffMessage;
  if (!backend || !environmentId || !project || !message || thread.kickoffWorkflow) {
    return false;
  }

  const workspaceRoot = project.workspace?.rootPath;
  const canonicalProjectId = resolveCanonicalProjectIdForWorkspaceRoot(
    workspaceRoot,
    project.id,
    liveProjects,
  );
  const projectExists = liveProjects.some((candidate) => candidate.id === canonicalProjectId);
  const plan = planThreadBootstrap({
    currentState: readThreadBootstrapDispatchState(thread.id),
    threadId: thread.id,
    hasServerThread: false,
    hasInitialUserMessage: true,
    hasKickoffWorkflow: false,
    hasProjectWorkspaceRoot: Boolean(workspaceRoot),
    projectExists,
  });
  if (plan.action !== "kickoff") {
    return false;
  }

  // The atomic call creates the thread, so a later pass that has not yet seen the server shell
  // (kickoffPending flips off first) must not plan a second bare `thread.create`.
  plan.state.threadCreateSent = true;
  publishExternalThreadBootstrapRun(thread.id, { status: "running", progress: null });
  const toolContext = createThreadChatTurnToolContext({
    embeddedMode: true,
    kickoffMessage: message,
    kickoffPending: true,
    kickoffWorkflow: undefined,
    projectId: project.id,
    projectTitle: project.title,
    projectSource: project.source,
    projectWorkspaceRoot: workspaceRoot,
    selectedToolIds: resolveSelectedToolIds(thread.selectedToolIds, undefined),
    threadId: thread.id,
    ticketId: undefined,
    ticketDisplayId: undefined,
    title: thread.title,
  });
  startThreadBootstrapRun(
    {
      backend,
      environmentId,
      threadId: thread.id,
      projectTitle: project.title,
      projectWorkspaceRoot: workspaceRoot,
      canonicalProjectId,
      title: thread.title,
      initialUserMessage: message,
      ...resolveThreadBootstrapKickoffDefaults({
        initialModelSelection: thread.kickoffModelSelection,
        initialRuntimeMode: thread.kickoffRuntimeMode,
        initialInteractionMode: thread.kickoffInteractionMode,
      }),
      kickoffBranch: null,
      ...(toolContext ? { toolContext } : {}),
      createdAt: new Date().toISOString(),
      shouldEnsureProject: plan.shouldEnsureProject,
      action: plan.action,
      state: plan.state,
      onInitialUserMessageSent: () => input.markKickoffConsumed(thread.id),
      onProgress: (progress) => publishExternalThreadBootstrapRun(thread.id, { progress }),
    },
    (status) => publishExternalThreadBootstrapRun(thread.id, { status }),
  );
  return true;
}
