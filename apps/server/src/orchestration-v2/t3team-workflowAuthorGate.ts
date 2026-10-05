/**
 * The run stream's hook for the hidden author thread's sandbox (`t3team-workflowAuthorApproval.ts`).
 *
 * `settle` answers a pending author-thread approval on the live provider session and reports it as
 * handled, so the caller skips ingesting it: the request never becomes a pending row anyone could
 * answer. A failed answer is logged and still skipped — the provider keeps waiting and the author
 * turn hits its deadline, which is the fail-closed outcome.
 *
 * Two call sites, because V2 ingests runtime requests on two paths: a run's own provider event
 * stream (`RunExecutionService`), and the session pump for runless requests raised before any run
 * subscribes (`ProviderSessionManager` — trust, login, session-switch hooks).
 */
import * as Effect from "effect/Effect";

import { makeWorkflowAuthorApprovalGate } from "../t3team-workflowAuthorApproval.ts";
import type { ProviderAdapterV2Event, ProviderAdapterV2SessionRuntime } from "./ProviderAdapter.ts";

export const makeWorkflowAuthorRunGate = (input: {
  readonly runThreadId: string;
  readonly session: Pick<ProviderAdapterV2SessionRuntime, "respondToRuntimeRequest">;
}) => {
  const gate = makeWorkflowAuthorApprovalGate();
  return {
    settle: (event: ProviderAdapterV2Event): Effect.Effect<boolean> => {
      const answer = gate.observe(event, input.runThreadId);
      if (answer === undefined) return Effect.succeed(false);
      return input.session.respondToRuntimeRequest(answer).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("could not settle an orchestration author approval", {
            requestId: answer.requestId,
            decision: answer.decision,
            cause,
          }),
        ),
        Effect.as(true),
      );
    },
  };
};

/** The session pump's runless-request path: no tool items exist there, so every approval declines. */
export const settleRunlessWorkflowAuthorRequest = (
  session: Pick<ProviderAdapterV2SessionRuntime, "respondToRuntimeRequest">,
  event: ProviderAdapterV2Event,
  threadId: string,
): Effect.Effect<boolean> =>
  makeWorkflowAuthorRunGate({ runThreadId: threadId, session }).settle(event);
