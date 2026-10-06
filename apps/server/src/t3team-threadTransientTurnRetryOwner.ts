/**
 * Who re-runs a run that failed transiently — the pure gate in front of the session-level retry
 * (`t3team-threadTransientTurnRetryReactor.ts`). Every failed run has exactly ONE retrier, so a
 * step or a task is never started twice:
 *
 * - `user-stop`: the user stopped the run (it carries a `run_interrupt_request`), so nothing
 *   continues it, whatever it failed with;
 * - `parent`: an app-owned `delegate_task` child — upstream already reported the failure to the
 *   parent exactly once (`Orchestrator.finalizeAppOwnedSubagent`), and the parent decides;
 * - `workflow`: the run answers a workflow `askAgent` step prompt — the workflow's own journaled
 *   re-drive (`t3team-workflowEngineTurnRetry.ts`) owns it;
 * - `session`: everything else — the transient retry continues it.
 *
 * @module t3team-threadTransientTurnRetryOwner
 */
import {
  type OrchestrationV2AppThread,
  type OrchestrationV2ConversationMessage,
  type OrchestrationV2Run,
  type OrchestrationV2TurnItem,
  readT3TeamMessageExtContext,
} from "@t3tools/contracts";

export type TransientRetryOwner = "user-stop" | "parent" | "workflow" | "session";

/** Turn item types the gate reads for the failed run (its failure and any Stop request). */
export const TRANSIENT_RETRY_TURN_ITEM_TYPES = ["error", "run_interrupt_request"] as const;

/**
 * Same test as `Orchestrator.appOwnedSubagentParentThreadId`: upstream wakes this thread's parent
 * exactly once when its run ends, whatever the terminal status.
 */
export const isAppOwnedDelegatedChild = (
  thread: Pick<OrchestrationV2AppThread, "lineage" | "forkedFrom">,
) =>
  thread.lineage.relationshipToParent === "subagent" &&
  thread.lineage.parentThreadId !== null &&
  thread.forkedFrom?.type === "node";

export function transientRetryOwner(input: {
  readonly thread: Pick<OrchestrationV2AppThread, "lineage" | "forkedFrom"> | null;
  readonly run: Pick<OrchestrationV2Run, "userMessageId">;
  /** The failed run's `TRANSIENT_RETRY_TURN_ITEM_TYPES` items. */
  readonly turnItems: ReadonlyArray<Pick<OrchestrationV2TurnItem, "type">>;
  /** The failed run's user message(s); the prompt is the one `run.userMessageId` names. */
  readonly messages: ReadonlyArray<Pick<OrchestrationV2ConversationMessage, "id" | "context">>;
}): TransientRetryOwner {
  if (input.turnItems.some((item) => item.type === "run_interrupt_request")) return "user-stop";
  if (input.thread !== null && isAppOwnedDelegatedChild(input.thread)) return "parent";
  const prompt = input.messages.find((message) => message.id === input.run.userMessageId);
  if (readT3TeamMessageExtContext(prompt?.context)?.author?.kind === "workflow") return "workflow";
  return "session";
}
