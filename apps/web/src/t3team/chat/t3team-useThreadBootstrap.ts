import { useCallback, useEffect, useRef, useState } from "react";
import {
  readThreadBootstrapDispatchState,
  resetThreadBootstrapDispatchState,
} from "~/t3team/chat/t3team-threadBootstrapDispatchRegistry";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { planThreadBootstrap } from "~/t3team/chat/t3team-threadBootstrapPlan";
import { runThreadBootstrap } from "~/t3team/chat/t3team-runThreadBootstrap";
import { resolveThreadBootstrapKickoffDefaults } from "~/t3team/chat/t3team-threadBootstrapKickoffDefaults";
import type { T3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";
import {
  recordThreadBootstrapFailure,
  recordThreadBootstrapPlan,
  recordThreadBootstrapSkipped,
} from "~/t3team/chat/t3team-threadBootstrapInstrumentation";

type ThreadBootstrapInput = {
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
  // While true, hold the kickoff dispatch: the branch it would carry is not resolved yet, and a
  // cold-load kickoff must not lock in `branch: null` before the real branch is known.
  isKickoffBranchQueryPending?: boolean;
  kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
  initialToolContext: T3TeamTurnToolContext | undefined;
  onInitialUserMessageSent: (() => void) | undefined;
  serverThread: unknown | null | undefined;
};

export type ThreadBootstrapStatus = "idle" | "running" | "failed";

export function useThreadBootstrap({
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
  isKickoffBranchQueryPending = false,
  kickoffWorkflow,
  initialToolContext,
  onInitialUserMessageSent,
  serverThread,
}: ThreadBootstrapInput): {
  bootstrapStatus: ThreadBootstrapStatus;
  retryThreadBootstrap: () => void;
} {
  const onInitialUserMessageSentRef = useRef(onInitialUserMessageSent);
  const [bootstrapStatus, setBootstrapStatus] = useState<ThreadBootstrapStatus>("idle");
  const [retryGeneration, setRetryGeneration] = useState(0);
  onInitialUserMessageSentRef.current = onInitialUserMessageSent;

  const retryThreadBootstrap = useCallback(() => {
    resetThreadBootstrapDispatchState(threadId);
    setBootstrapStatus("idle");
    setRetryGeneration((value) => value + 1);
  }, [threadId]);

  useEffect(() => {
    let active = true;
    const updateBootstrapStatus = (status: ThreadBootstrapStatus) => {
      if (active) {
        setBootstrapStatus(status);
      }
    };

    if (!backend || !environmentId) {
      updateBootstrapStatus("idle");
      recordThreadBootstrapSkipped({
        threadId,
        reason: !backend ? "missing-backend" : "missing-environment",
      });
      return () => {
        active = false;
      };
    }

    const bootstrapPlan = planThreadBootstrap({
      // Shared per threadId, not per component instance: one launch remounts this view, and a
      // per-instance ref made the fresh mount replay the kickoff (duplicate `thread.create`).
      currentState: readThreadBootstrapDispatchState(threadId),
      threadId,
      hasServerThread: serverThread != null,
      hasInitialUserMessage: Boolean(initialUserMessage),
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
      return () => {
        active = false;
      };
    }

    // Hold the kickoff until the branch query settles: dispatching now would send `branch: null`
    // for a workspace that does have one, and the effect re-runs once
    // `isKickoffBranchQueryPending` flips (or `retryThreadBootstrap` is called), so this state
    // isn't claimed and the kickoff is not lost — just deferred.
    if (bootstrapPlan.action === "kickoff" && isKickoffBranchQueryPending) {
      updateBootstrapStatus("running");
      return () => {
        active = false;
      };
    }

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
      kickoffBranch: initialBranch ?? null,
      ...(kickoffWorkflow ? { kickoffWorkflow } : {}),
      ...(initialToolContext !== undefined ? { toolContext: initialToolContext } : {}),
      createdAt,
      shouldEnsureProject: bootstrapPlan.shouldEnsureProject,
      action: bootstrapPlan.action,
      state: bootstrapPlan.state,
      onInitialUserMessageSent: onInitialUserMessageSentRef.current,
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

    return () => {
      active = false;
    };
  }, [
    backend,
    canonicalProjectId,
    environmentId,
    initialBranch,
    initialInteractionMode,
    isKickoffBranchQueryPending,
    kickoffWorkflow,
    initialModelSelection,
    initialRuntimeMode,
    initialToolContext,
    initialUserMessage,
    projectExists,
    projectTitle,
    projectWorkspaceRoot,
    retryGeneration,
    serverThread,
    threadId,
    title,
  ]);

  return {
    bootstrapStatus,
    retryThreadBootstrap,
  };
}
