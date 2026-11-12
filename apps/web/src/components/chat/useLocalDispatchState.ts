import { type MessageId, type RuntimeRequestId } from "@t3tools/contracts";
import { useEffect, useState } from "react";
import { type ComposerSubmissionIntent } from "../../composer-logic";
import { type SessionPhase, type Thread } from "../../types";
import {
  createLocalDispatchSnapshot,
  hasLocalDispatchGoneStuck,
  hasServerAcknowledgedLocalDispatch,
  type LocalDispatchSnapshot,
} from "../ChatView.logic";

export function useLocalDispatchState(input: {
  activeThread: Thread | undefined;
  activeLatestRun: Thread["latestRun"] | null;
  latestUserMessageId: MessageId | null;
  phase: SessionPhase;
  activePendingApproval: RuntimeRequestId | null;
  activePendingUserInput: RuntimeRequestId | null;
  threadError: string | null | undefined;
}) {
  const [localDispatch, setLocalDispatch] = useState<LocalDispatchSnapshot | null>(null);

  const resetLocalDispatch = () => {
    setLocalDispatch(null);
  };

  const serverAcknowledgedLocalDispatch = hasServerAcknowledgedLocalDispatch({
    localDispatch,
    phase: input.phase,
    latestRun: input.activeLatestRun,
    latestUserMessageId: input.latestUserMessageId,
    runtime: input.activeThread?.runtime ?? null,
    hasPendingApproval: input.activePendingApproval !== null,
    hasPendingUserInput: input.activePendingUserInput !== null,
    threadError: input.threadError,
  });
  const activeLocalDispatch = serverAcknowledgedLocalDispatch ? null : localDispatch;
  // t3team GHE #301 stuck-busy backstop: if a dispatch is still unacknowledged and
  // no server-visible field it watches (run timestamps, runtime status/updatedAt,
  // the user message echo) has changed for the idle window, the run died on the
  // provider side without a terminal event — abandon the dispatch and recover the
  // composer without a manual thread switch.
  useEffect(() => {
    if (localDispatch === null || serverAcknowledgedLocalDispatch) {
      return;
    }
    const evaluate = () => {
      if (
        hasLocalDispatchGoneStuck({
          localDispatch,
          latestRun: input.activeLatestRun,
          latestUserMessageCreatedAt: input.activeThread?.latestUserMessageAt ?? null,
          runtime: input.activeThread?.runtime ?? null,
          hasPendingApproval: input.activePendingApproval !== null,
          hasPendingUserInput: input.activePendingUserInput !== null,
          threadError: input.threadError,
          preparingWorktree: localDispatch.preparingWorktree,
          now: new Date().toISOString(),
        })
      ) {
        setLocalDispatch(null);
      }
    };
    evaluate();
    const timer = window.setInterval(evaluate, 15_000);
    return () => window.clearInterval(timer);
  }, [
    localDispatch,
    serverAcknowledgedLocalDispatch,
    input.activeLatestRun,
    input.activePendingApproval,
    input.activePendingUserInput,
    input.activeThread?.runtime,
    input.activeThread?.latestUserMessageAt,
    input.threadError,
  ]);
  const beginLocalDispatch = (options?: {
    preparingWorktree?: boolean;
    submissionIntent?: ComposerSubmissionIntent;
  }) => {
    const preparingWorktree = Boolean(options?.preparingWorktree);
    setLocalDispatch((current) => {
      const active = serverAcknowledgedLocalDispatch ? null : current;
      if (active) {
        const submissionIntent = options?.submissionIntent ?? active.submissionIntent;
        return active.preparingWorktree === preparingWorktree &&
          active.submissionIntent === submissionIntent
          ? active
          : { ...active, preparingWorktree, submissionIntent };
      }
      return createLocalDispatchSnapshot(input.activeThread, {
        ...options,
        latestUserMessageId: input.latestUserMessageId,
      });
    });
  };

  return {
    beginLocalDispatch,
    resetLocalDispatch,
    localDispatchStartedAt: activeLocalDispatch?.startedAt ?? null,
    isPreparingWorktree: activeLocalDispatch?.preparingWorktree ?? false,
    isSendBusy: activeLocalDispatch !== null,
    backgroundSubmissionPending: activeLocalDispatch?.submissionIntent === "background",
  };
}
