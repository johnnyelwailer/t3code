/**
 * One-click retry (`message.dispatch` with `manualContinuationOfRunId`) must accept an ordinary
 * failed run, not only interruptions, usage limits and transient failures — and must still refuse
 * runs that ended on purpose (cancelled/completed) or an older unacknowledged Stop recorded as
 * failed.
 */
import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  type OrchestrationV2ProviderFailure,
  type OrchestrationV2Run,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "../t3team-v2/t3team-v2Orchestrator.testkit.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";

/** A thread whose only run ended with `status` (and `failure` on its root node, when given). */
const threadWithEndedRun = (
  threadId: ThreadId,
  status: OrchestrationV2Run["status"],
  failure: OrchestrationV2ProviderFailure | null,
) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    yield* createTestThread(threadId);
    yield* orchestrator.dispatch({
      type: "message.dispatch",
      commandId: CommandId.make(`start:${threadId}`),
      threadId,
      messageId: MessageId.make(`start:${threadId}`),
      text: "Refactor the parser",
      attachments: [],
      dispatchMode: { type: "start_immediately" },
      createdBy: "user",
      creationSource: "web",
    });
    const { runs } = yield* projections.getThreadRecords(threadId, ["runs"]);
    const run = runs.at(-1) as OrchestrationV2Run;
    const now = yield* DateTime.now;
    yield* projections.apply({
      id: EventId.make(`ended:${threadId}`),
      type: "run.updated",
      threadId,
      runId: run.id,
      occurredAt: now,
      payload: { ...run, status, startedAt: now, completedAt: now },
    });
    if (failure !== null) {
      yield* projections.apply({
        id: EventId.make(`error:${threadId}`),
        type: "turn-item.updated",
        threadId,
        runId: run.id,
        occurredAt: now,
        payload: {
          id: TurnItemId.make(`error:${threadId}`),
          threadId,
          runId: run.id,
          nodeId: run.rootNodeId,
          providerThreadId: null,
          providerTurnId: null,
          nativeItemRef: null,
          parentItemId: null,
          ordinal: 5,
          status: "failed",
          title: null,
          startedAt: now,
          completedAt: now,
          updatedAt: now,
          type: "error",
          failure,
        },
      });
    }
    return run;
  });

const providerError: OrchestrationV2ProviderFailure = {
  class: "provider_error",
  message: "The model returned an error",
  code: null,
  retryable: null,
};

const cases: ReadonlyArray<
  readonly [
    name: string,
    status: OrchestrationV2Run["status"],
    failure: OrchestrationV2ProviderFailure | null,
    accepted: boolean,
  ]
> = [
  ["provider-error", "failed", providerError, true],
  ["unknown-failure", "failed", { ...providerError, class: "unknown" }, true],
  ["auth", "failed", { ...providerError, class: "permission_error", message: "401" }, true],
  ["failed-without-item", "failed", null, true],
  ["interrupted", "interrupted", null, true],
  [
    "legacy-failed-unacknowledged-stop",
    "failed",
    { ...providerError, class: "transport_error", code: "interrupt_no_terminal" },
    false,
  ],
  ["cancelled", "cancelled", null, false],
  ["completed", "completed", null, false],
];

it.layer(makeT3TeamV2TestLayer("t3team-manual-continuation"))(
  "manual continuation eligibility",
  (it) => {
    it.effect(
      "accepts every failed run except an unanswered Stop, refuses ended-on-purpose runs",
      () =>
        Effect.gen(function* () {
          const orchestrator = yield* Orchestrator.OrchestratorV2;
          const projections = yield* ProjectionStore.ProjectionStoreV2;
          for (const [name, status, failure, accepted] of cases) {
            const threadId = ThreadId.make(`thread:continue-${name}`);
            const source = yield* threadWithEndedRun(threadId, status, failure);
            const messageId = MessageId.make(`continue:${name}`);
            const exit = yield* Effect.exit(
              orchestrator.dispatch({
                type: "message.dispatch",
                commandId: CommandId.make(`continue:${name}`),
                threadId,
                messageId,
                text: "Continue where you left off.",
                attachments: [],
                manualContinuationOfRunId: source.id,
                dispatchMode: { type: "start_immediately" },
                createdBy: "user",
                creationSource: "web",
              }),
            );
            assert.strictEqual(exit._tag, accepted ? "Success" : "Failure", name);
            const { runs } = yield* projections.getThreadRecords(threadId, ["runs"]);
            const continuation = runs.find((run) => run.userMessageId === messageId);
            // A continuation is a NEW run; the source run is left as it ended.
            assert.strictEqual(continuation !== undefined, accepted, name);
            assert.strictEqual(runs.find((run) => run.id === source.id)?.status, status, name);
          }
        }),
    );
  },
);
