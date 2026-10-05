/**
 * Host-side guarantee for the hidden author thread: a provider approval that still arrives
 * (command, file change, or any other tool approval) is declined here and never becomes an
 * activity the user can answer. The thread is identified by the author session registry — the
 * same record the broker uses to treat that thread's `t3team.orchestration.run` as a submission.
 */
import { ApprovalRequestId, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { ProviderServiceError } from "./provider/Errors.ts";
import { workflowAuthorSessionForThread } from "./t3team-workflowAuthorSession.ts";

export const declineAuthorThreadApproval = (input: {
  readonly threadId: ThreadId;
  readonly requestId: ApprovalRequestId | undefined;
  readonly respondToRequest: (request: {
    readonly threadId: ThreadId;
    readonly requestId: ApprovalRequestId;
    readonly decision: "decline";
  }) => Effect.Effect<void, ProviderServiceError>;
}): Effect.Effect<boolean, ProviderServiceError> => {
  if (workflowAuthorSessionForThread(String(input.threadId)) === undefined) {
    return Effect.succeed(false);
  }
  if (input.requestId === undefined) return Effect.succeed(true);
  return input
    .respondToRequest({
      threadId: input.threadId,
      requestId: input.requestId,
      decision: "decline",
    })
    .pipe(Effect.as(true));
};
