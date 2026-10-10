/**
 * A workflow waiting on the user's answer is waiting on the user just like a
 * provider question, so the shell reports it as pending user input — the
 * signal notifications and the sidebar already watch.
 *
 * The ask lives in `workflow_runs`; the host mirrors it onto the thread record
 * (`thread.pendingWorkflowAsk`, see t3team-v2/t3team-threadWorkflowAsk.ts).
 * A live provider request or secret request still wins: it is the one the
 * user can answer right now.
 */
import {
  type OrchestrationV2AppThread,
  type OrchestrationV2PendingRuntimeRequestSummary,
  RuntimeRequestId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

/** Prefix of the stand-in request id; the rest is the ask's correlation id. */
const WORKFLOW_ASK_REQUEST_ID_PREFIX = "t3team-wf-ask:";

export function shellPendingRuntimeRequest(
  request: OrchestrationV2PendingRuntimeRequestSummary | null,
  thread: Pick<OrchestrationV2AppThread, "pendingWorkflowAsk">,
): OrchestrationV2PendingRuntimeRequestSummary | null {
  if (request !== null) {
    return { id: request.id, kind: request.kind, createdAt: request.createdAt };
  }
  const ask = thread.pendingWorkflowAsk;
  if (ask == null) return null;
  return {
    id: RuntimeRequestId.make(`${WORKFLOW_ASK_REQUEST_ID_PREFIX}${ask.correlationId}`),
    kind: "user_input",
    createdAt: DateTime.makeUnsafe(ask.createdAt),
  };
}
