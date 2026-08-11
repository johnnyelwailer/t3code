import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import { readThreadBootstrapDispatchState } from "~/t3team/chat/t3team-threadBootstrapDispatchRegistry";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import {
  planThreadBootstrap,
  type ThreadBootstrapDispatchState,
} from "~/t3team/chat/t3team-threadBootstrapPlan";
import { runThreadBootstrap } from "~/t3team/chat/t3team-runThreadBootstrap";
import { resolveThreadBootstrapKickoffDefaults } from "~/t3team/chat/t3team-threadBootstrapKickoffDefaults";
import { recordT3TeamThreadDebug } from "~/t3team/chat/t3team-threadDebug";
import type { T3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";
import { randomUUID } from "~/lib/utils";
import {
  recordThreadBootstrapFailure,
  recordThreadBootstrapPlan,
  recordThreadBootstrapSkipped,
} from "~/t3team/chat/t3team-threadBootstrapInstrumentation";

export type ThreadBootstrapStatus = "idle" | "running" | "failed";

export interface RunThreadBootstrapEffectInput {
  backend: BackendApi | null | undefined;
  environmentId: string | null | undefined;
  threadId: string;
  projectTitle: string;
  projectWorkspaceRoot: string | undefined;
  canonicalProjectId: string;
  projectExists: boolean;
  title: string;
  initialUserMessage: string | undefined;
  initialModelSelection: ModelSelection | undefined;
  initialRuntimeMode: RuntimeMode | undefined;
  initialInteractionMode: ProviderInteractionMode | undefined;
  initialBranch: string | undefined;
  kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
  initialToolContext: T3TeamTurnToolContext | undefined;
  onInitialUserMessageSent: (() => void) | undefined;
  serverThread: unknown | null | undefined;
  updateBootstrapStatus: (status: ThreadBootstrapStatus) => void;
}

/**
 * Backfills the branch onto an already-dispatched thread once the workspace's git status query
 * resolves. The create/kickoff dispatch never waits for that query (see `runThreadBootstrapEffect`
 * below), so it may have gone out with `branch: null`; once `initialBranch` has a real value this
 * sends it via `thread.meta.update`, guarded by `expectedBranch: null` so it never clobbers a
 * branch the user (or a later turn) already set explicitly, and by `branchBackfillSent` so it
 * fires at most once per thread.
 */
function maybeBackfillKickoffBranch(input: {
  backend: BackendApi;
  threadId: string;
  initialBranch: string | undefined;
  hasServerThread: boolean;
  state: ThreadBootstrapDispatchState;
}): void {
  const { backend, threadId, initialBranch, hasServerThread, state } = input;

  // Only fires for a thread THIS hook dispatched with an unresolved branch (`dispatchedBranch ===
  // null`). `undefined` means nothing was dispatched here (e.g. a server thread that showed up
  // without our bootstrap) and a string means the branch is already set — either way, no backfill.
  // `hasServerThread` gates on the thread provably existing server-side: `kickoffSent` flips
  // synchronously long before `thread.create` lands, and a backfill dispatched into that window is
  // rejected — with one interleaving (serverThread arrives while the doomed send is in flight)
  // where the reset flag never gets another effect pass and the thread stayed branchless forever.
  if (
    !hasServerThread ||
    state.dispatchedBranch !== null ||
    state.branchBackfillSent ||
    initialBranch === undefined
  ) {
    return;
  }

  state.branchBackfillSent = true;
  void backend
    .dispatchCommand({
      type: "thread.meta.update",
      commandId: randomUUID() as any,
      threadId: threadId as any,
      branch: initialBranch,
      expectedBranch: null,
    })
    .then(() => {
      state.dispatchedBranch = initialBranch;
    })
    .catch((error) => {
      state.branchBackfillSent = false;
      recordT3TeamThreadDebug("thread-bootstrap.branch-backfill.failure", {
        threadId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

/**
 * Plans and, when ready, dispatches one thread-bootstrap attempt: this is the decision + side
 * effect that `useThreadBootstrap`'s effect fires on every dependency change, pulled out so that
 * hook (state/refs/effect wiring) stays separate from bootstrap policy (what to dispatch, when to
 * hold, how to recover from a failed dispatch). Status changes are reported through
 * `updateBootstrapStatus` rather than returned, since the caller owns the "am I still mounted"
 * guard around it.
 */
export function runThreadBootstrapEffect(input: RunThreadBootstrapEffectInput): void {
  const {
    backend,
    environmentId,
    threadId,
    projectTitle,
    projectWorkspaceRoot,
    canonicalProjectId,
    projectExists,
    title,
    initialUserMessage,
    initialModelSelection,
    initialRuntimeMode,
    initialInteractionMode,
    initialBranch,
    kickoffWorkflow,
    initialToolContext,
    onInitialUserMessageSent,
    serverThread,
    updateBootstrapStatus,
  } = input;

  if (!backend || !environmentId) {
    updateBootstrapStatus("idle");
    recordThreadBootstrapSkipped({
      threadId,
      reason: !backend ? "missing-backend" : "missing-environment",
    });
    return;
  }

  const bootstrapPlan = planThreadBootstrap({
    // Shared per threadId, not per component instance: one launch remounts this view, and a
    // per-instance ref made the fresh mount replay the kickoff (duplicate `thread.create`).
    currentState: readThreadBootstrapDispatchState(threadId),
    threadId,
    hasServerThread: serverThread != null,
    hasInitialUserMessage: Boolean(initialUserMessage),
    hasKickoffWorkflow: kickoffWorkflow !== undefined,
    hasProjectWorkspaceRoot: Boolean(projectWorkspaceRoot),
    projectExists,
  });

  recordThreadBootstrapPlan({
    environmentId,
    threadId,
    canonicalProjectId,
    projectExists,
    action: bootstrapPlan.action,
    shouldEnsureProject: bootstrapPlan.shouldEnsureProject,
    hasServerThread: serverThread != null,
    hasInitialUserMessage: Boolean(initialUserMessage),
    serverThread,
    dispatchState: bootstrapPlan.state,
  });

  if (serverThread != null) {
    updateBootstrapStatus("idle");
  } else if (
    bootstrapPlan.action === "none" &&
    (bootstrapPlan.state.kickoffSent || bootstrapPlan.state.threadCreateSent)
  ) {
    updateBootstrapStatus("running");
  } else if (bootstrapPlan.action === "none") {
    updateBootstrapStatus("idle");
  } else {
    updateBootstrapStatus("running");
  }

  if (bootstrapPlan.action === "none") {
    // The dispatch already went out on an earlier pass. The branch it carried may have been
    // `null` because the workspace's git status hadn't resolved yet — backfill it now that
    // `initialBranch` has a value, rather than leaving the thread branchless forever.
    maybeBackfillKickoffBranch({
      backend,
      threadId,
      initialBranch,
      hasServerThread: serverThread != null,
      state: bootstrapPlan.state,
    });
    return;
  }

  // `thread.create`/`thread.turn.start` must dispatch as soon as everything else is ready — never
  // held for the branch query. The branch this dispatch carries is whatever is synchronously
  // known right now (often `undefined` on a fresh kickoff, since the environment the branch query
  // needs may not exist until this very dispatch creates it — holding on it deadlocks the launch).
  // `maybeBackfillKickoffBranch` above sends the real branch via `thread.meta.update` once the
  // query resolves on a later pass.
  const dispatchedBranch = initialBranch ?? null;
  bootstrapPlan.state.dispatchedBranch = dispatchedBranch;

  // Claim the dispatch synchronously, before the first `await` inside runThreadBootstrap can
  // yield: a second effect pass in the same tick would otherwise still read the un-flagged state.
  if (bootstrapPlan.action === "kickoff") {
    bootstrapPlan.state.kickoffSent = true;
  } else {
    bootstrapPlan.state.threadCreateSent = true;
  }

  const createdAt = new Date().toISOString();
  const kickoffDefaults = resolveThreadBootstrapKickoffDefaults({
    initialModelSelection,
    initialRuntimeMode,
    initialInteractionMode,
  });
  void runThreadBootstrap({
    backend,
    environmentId,
    threadId,
    projectTitle,
    projectWorkspaceRoot,
    canonicalProjectId,
    title,
    initialUserMessage,
    ...kickoffDefaults,
    kickoffBranch: dispatchedBranch,
    ...(kickoffWorkflow ? { kickoffWorkflow } : {}),
    ...(initialToolContext !== undefined ? { toolContext: initialToolContext } : {}),
    createdAt,
    shouldEnsureProject: bootstrapPlan.shouldEnsureProject,
    action: bootstrapPlan.action,
    state: bootstrapPlan.state,
    onInitialUserMessageSent,
  }).catch((error) => {
    updateBootstrapStatus("failed");
    recordThreadBootstrapFailure({
      environmentId,
      threadId,
      canonicalProjectId,
      action: bootstrapPlan.action,
      error: error instanceof Error ? error.message : String(error),
    });

    if (bootstrapPlan.action === "kickoff") {
      bootstrapPlan.state.kickoffSent = false;
    } else if (bootstrapPlan.action === "create") {
      bootstrapPlan.state.threadCreateSent = false;
    }
  });
}
