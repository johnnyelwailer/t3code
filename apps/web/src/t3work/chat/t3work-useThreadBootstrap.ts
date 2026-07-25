import { useCallback, useEffect, useRef, useState } from "react";
import {
  readThreadBootstrapDispatchState,
  resetThreadBootstrapDispatchState,
} from "~/t3work/chat/t3work-threadBootstrapDispatchRegistry";
import {
  DEFAULT_RUNTIME_MODE,
  type ModelSelection,
  type ProviderInteractionMode,
  type RuntimeMode,
} from "@t3tools/contracts";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import { planThreadBootstrap } from "~/t3work/chat/t3work-threadBootstrapPlan";
import { runThreadBootstrap } from "~/t3work/chat/t3work-runThreadBootstrap";
import type { T3workTurnToolContext } from "~/t3work/t3work-threadToolContext";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";
import { getConfiguredDefaultModelSelection } from "~/configuredDefaultModelSelection";
import {
  recordThreadBootstrapFailure,
  recordThreadBootstrapPlan,
  recordThreadBootstrapSkipped,
} from "~/t3work/chat/t3work-threadBootstrapInstrumentation";

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
  kickoffWorkflow: T3workKickoffWorkflow | undefined;
  initialToolContext: T3workTurnToolContext | undefined;
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

    // Claim the dispatch synchronously, before the first `await` inside runThreadBootstrap can
    // yield: a second effect pass in the same tick would otherwise still read the un-flagged state.
    if (bootstrapPlan.action === "kickoff") {
      bootstrapPlan.state.kickoffSent = true;
    } else {
      bootstrapPlan.state.threadCreateSent = true;
    }

    const createdAt = new Date().toISOString();
    const kickoffModelSelection = initialModelSelection ?? getConfiguredDefaultModelSelection();
    const kickoffRuntimeMode = initialRuntimeMode ?? DEFAULT_RUNTIME_MODE;
    const kickoffInteractionMode = initialInteractionMode ?? ("default" as ProviderInteractionMode);
    void runThreadBootstrap({
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
    initialInteractionMode,
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
