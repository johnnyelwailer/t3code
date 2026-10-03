/**
 * Which answer an `askAgent` step resolves with on V2 — the pure half of the workflow reactor.
 *
 * A step's prompt starts (or queues) one V2 run; that run reaching a TERMINAL status is the
 * turn-end signal, and V2 commits the terminal `run.updated` only after the run's last assistant
 * message (both come from one ingest loop, finalized at root completion), so reading the run's
 * records at that point sees the whole turn. The answer is the run's LAST substantive assistant
 * message — upstream's `subagentResultForRun`, the same reader delegated tasks use — never the
 * concatenation: a turn narrates, calls tools and ends in its answer, and pasting the narration
 * into a caller's value (a description draft, a schema payload) is the bug this avoids.
 *
 * A restart interrupts a running turn and V2's restart continuation resumes it as a NEW run
 * linked by `restartContinuationOfRunId`; the step follows that chain to its latest run, so the
 * continuation's answer settles the step instead of the cancelled original's preamble.
 */
import type { OrchestrationV2Run, OrchestrationV2ThreadProjection } from "@t3tools/contracts";

import { subagentResultForRun } from "./orchestration-v2/SubagentProjection.ts";
import { isTerminalRunStatus } from "./orchestration-v2/ThreadManagementService.ts";

export type WorkflowTurnSettlement =
  /** The step's run is queued or still running — wait for its terminal `run.updated`. */
  | { readonly kind: "pending" }
  | { readonly kind: "answer"; readonly text: string; readonly messageId: string | null }
  /** The run completed without a single substantive assistant message. */
  | { readonly kind: "empty" }
  /**
   * The run ended WITHOUT completing (failed, interrupted, cancelled, rolled back). Whatever it
   * streamed before that was preamble, never the answer; `error` names the provider's reason.
   */
  | { readonly kind: "failed"; readonly error: string };

/** The run that answers the prompt `promptMessageId`, following restart continuations. */
export function resolveStepRun(
  runs: ReadonlyArray<OrchestrationV2Run>,
  promptMessageId: string,
): OrchestrationV2Run | undefined {
  let current = runs.find((run) => run.userMessageId === promptMessageId);
  for (let hops = 0; current !== undefined && hops < runs.length; hops += 1) {
    const sourceId = current.id;
    const continuation = runs
      .filter((run) => run.restartContinuationOfRunId === sourceId)
      .toSorted((left, right) => right.ordinal - left.ordinal)[0];
    if (continuation === undefined) break;
    current = continuation;
  }
  return current;
}

const INTERRUPTED_TURN = "The agent turn ended before it completed";

/** Judge a step's (resolved) run from its records. */
export function judgeStepRun(
  projection: Pick<OrchestrationV2ThreadProjection, "messages" | "turnItems">,
  run: OrchestrationV2Run,
): WorkflowTurnSettlement {
  if (!isTerminalRunStatus(run.status)) return { kind: "pending" };
  // `subagentResultForRun` picks the most recently updated message; order ties (one provider
  // write can stamp several messages with the same instant) by timeline position, latest first.
  const position = new Map(
    projection.turnItems.flatMap((item) =>
      item.type === "assistant_message" ? [[item.messageId, item.ordinal] as const] : [],
    ),
  );
  const messages = projection.messages.toSorted(
    (left, right) => (position.get(right.id) ?? -1) - (position.get(left.id) ?? -1),
  );
  const result = subagentResultForRun({ messages, turnItems: projection.turnItems }, run);
  if (run.status === "completed") {
    return result.messageId === null && result.turnItemId === null
      ? { kind: "empty" }
      : { kind: "answer", text: result.text, messageId: result.messageId };
  }
  if (run.status === "failed") return { kind: "failed", error: result.text };
  return { kind: "failed", error: `${INTERRUPTED_TURN} (${run.status}).` };
}
