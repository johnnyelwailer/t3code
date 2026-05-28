import { useEffect, useRef } from "react";
import {
  DEFAULT_MODEL,
  DEFAULT_RUNTIME_MODE,
  ProviderInstanceId,
  type ModelSelection,
  type ProviderInteractionMode,
  type RuntimeMode,
} from "@t3tools/contracts";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import {
  planThreadBootstrap,
  type ThreadBootstrapDispatchState,
} from "~/t3work/chat/t3work-threadBootstrapPlan";
import { runThreadBootstrap } from "~/t3work/chat/t3work-runThreadBootstrap";
import type { T3workTurnToolContext } from "~/t3work/t3work-threadToolContext";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";
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
  serverThread: unknown | undefined;
};

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
}: ThreadBootstrapInput): void {
  const dispatchStateRef = useRef<ThreadBootstrapDispatchState | undefined>(undefined);
  const onInitialUserMessageSentRef = useRef(onInitialUserMessageSent);
  onInitialUserMessageSentRef.current = onInitialUserMessageSent;

  useEffect(() => {
    if (!backend || !environmentId) {
      recordThreadBootstrapSkipped({
        threadId,
        reason: !backend ? "missing-backend" : "missing-environment",
      });
      return;
    }

    const bootstrapPlan = planThreadBootstrap({
      currentState: dispatchStateRef.current,
      threadId,
      hasServerThread: serverThread !== undefined,
      hasInitialUserMessage: Boolean(initialUserMessage),
      hasProjectWorkspaceRoot: Boolean(projectWorkspaceRoot),
      projectExists,
    });
    dispatchStateRef.current = bootstrapPlan.state;

    recordThreadBootstrapPlan({
      environmentId,
      threadId,
      canonicalProjectId,
      projectExists,
      action: bootstrapPlan.action,
      shouldEnsureProject: bootstrapPlan.shouldEnsureProject,
      hasServerThread: serverThread !== undefined,
      hasInitialUserMessage: Boolean(initialUserMessage),
      serverThread,
      dispatchState: bootstrapPlan.state,
    });

    if (bootstrapPlan.action === "none") {
      return;
    }

    const createdAt = new Date().toISOString();
    const kickoffModelSelection =
      initialModelSelection ??
      ({
        instanceId: ProviderInstanceId.make("codex"),
        model: DEFAULT_MODEL,
      } as ModelSelection);
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
    serverThread,
    threadId,
    title,
  ]);
}
