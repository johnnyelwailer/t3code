import { useCallback, useEffect, useRef, useState } from "react";
import { resetThreadBootstrapDispatchState } from "~/t3team/chat/t3team-threadBootstrapDispatchRegistry";
import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import {
  runThreadBootstrapEffect,
  type ThreadBootstrapStatus,
} from "~/t3team/chat/t3team-runThreadBootstrapEffect";
import type { T3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

export type { ThreadBootstrapStatus } from "~/t3team/chat/t3team-runThreadBootstrapEffect";

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
  kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
  initialToolContext: T3TeamTurnToolContext | undefined;
  onInitialUserMessageSent: (() => void) | undefined;
  serverThread: { readonly branch: string | null } | null | undefined;
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
  initialBranch,
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
  const launchAttemptRef = useRef(0);
  const threadIdRef = useRef(threadId);
  onInitialUserMessageSentRef.current = onInitialUserMessageSent;
  threadIdRef.current = threadId;

  const retryThreadBootstrap = useCallback(() => {
    resetThreadBootstrapDispatchState(threadId);
    launchAttemptRef.current += 1;
    setBootstrapStatus("idle");
    setRetryGeneration((value) => value + 1);
  }, [threadId]);

  useEffect(() => {
    // The server shell arriving re-runs this effect while the kickoff promise is still
    // going. Only a retry starts a new attempt; the in-flight promise must still be able
    // to report failure after that re-run.
    const attempt = launchAttemptRef.current;
    const threadAtStart = threadId;
    const updateBootstrapStatus = (status: ThreadBootstrapStatus) => {
      if (launchAttemptRef.current !== attempt || threadIdRef.current !== threadAtStart) return;
      setBootstrapStatus(status);
    };

    runThreadBootstrapEffect({
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
      onInitialUserMessageSent: onInitialUserMessageSentRef.current,
      serverThread,
      updateBootstrapStatus,
    });
  }, [
    backend,
    canonicalProjectId,
    environmentId,
    initialBranch,
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
