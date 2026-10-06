import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  NodeId,
  type OrchestrationV2ProviderFailure,
  type OrchestrationV2Run,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "./orchestration-v2/ProjectionStore.ts";
import {
  transientRetryMessageId,
  transientRetryNoteId,
} from "./t3team-threadTransientTurnRetryPlan.ts";
import { TRANSIENT_RETRY_TURN_ITEM_TYPES } from "./t3team-threadTransientTurnRetryOwner.ts";
import {
  handleTransientRunFailure,
  type TransientRetryDeps,
} from "./t3team-threadTransientTurnRetryReactor.ts";
import { workflowPromptContext } from "./t3team-workflowTurnPrompt.ts";
import { T3TeamThreadMessageRecorder } from "./t3team-v2/t3team-threadMessageRecorder.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";

const liveDeps = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const recorder = yield* T3TeamThreadMessageRecorder;
  return {
    loadRecords: (threadId, runId) =>
      projections
        .getThreadRecords(threadId, ["runs", "turnItems", "messages"], {
          turnItemRunId: runId,
          turnItemTypes: TRANSIENT_RETRY_TURN_ITEM_TYPES,
          messageRunIds: [runId],
          messageRoles: ["user"],
        })
        .pipe(Effect.orDie),
    dispatch: (command) => orchestrator.dispatch(command).pipe(Effect.mapError(String)),
    recordNote: ({ threadId, messageId, text }) =>
      recorder.record({ threadId, messageId, role: "system", text }).pipe(Effect.mapError(String)),
    delayMs: () => 0,
  } satisfies TransientRetryDeps;
});

/** A thread whose only run FAILED with `failure` on its root node. */
const threadWithFailedRun = (
  threadId: ThreadId,
  failure: OrchestrationV2ProviderFailure,
  prompt: { readonly context?: ReturnType<typeof workflowPromptContext> } = {},
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
      ...(prompt.context === undefined ? {} : { context: prompt.context }),
      dispatchMode: { type: "start_immediately" },
      createdBy: "user",
      creationSource: "web",
    });
    const { runs } = yield* projections.getThreadRecords(threadId, ["runs"]);
    const run = runs.at(-1) as OrchestrationV2Run;
    const now = yield* DateTime.now;
    yield* projections.apply({
      id: EventId.make(`failed:${threadId}`),
      type: "run.updated",
      threadId,
      runId: run.id,
      occurredAt: now,
      payload: { ...run, status: "failed", startedAt: now, completedAt: now },
    });
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
    return run;
  });

const stall: OrchestrationV2ProviderFailure = {
  class: "transport_error",
  message: "Provider stream stalled (no activity for 600s)",
  code: "turn_inactivity",
  retryable: true,
};

it.layer(makeT3TeamV2TestLayer("t3team-transient-retry"))("transient run retry on V2", (it) => {
  it.effect("notes the retry and continues the failed run through the eligibility hook", () =>
    Effect.gen(function* () {
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:retry-stall");
      const failed = yield* threadWithFailedRun(threadId, stall);

      yield* handleTransientRunFailure(yield* liveDeps, { threadId, runId: failed.id });

      const records = yield* projections.getThreadRecords(threadId, ["runs", "messages"]);
      const retryRun = records.runs.find(
        (run) => run.userMessageId === transientRetryMessageId(failed.id),
      );
      assert.ok(retryRun, "the failed run is continued by a retry run");
      assert.notStrictEqual(retryRun.status, "failed");
      const note = records.messages.find(
        (message) => message.id === transientRetryNoteId(failed.id),
      );
      assert.strictEqual(note?.role, "system");
      assert.include(note?.text ?? "", "Retrying (1/3) — Provider stream stalled");
    }),
  );

  it.effect("leaves non-transient failures and unanswered stops alone", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      for (const [name, failure] of [
        [
          "auth",
          { class: "permission_error", message: "401 unauthorized", code: null, retryable: null },
        ],
        ["stop", { ...stall, code: "interrupt_no_terminal" }],
      ] as const) {
        const threadId = ThreadId.make(`thread:retry-${name}`);
        const failed = yield* threadWithFailedRun(threadId, failure);
        yield* handleTransientRunFailure(yield* liveDeps, { threadId, runId: failed.id });
        const { runs } = yield* projections.getThreadRecords(threadId, ["runs"]);
        assert.strictEqual(runs.length, 1, name);
        // Upstream rejects a manual continuation of such a run, too.
        const rejected = yield* Effect.exit(
          orchestrator.dispatch({
            type: "message.dispatch",
            commandId: CommandId.make(`manual:${name}`),
            threadId,
            messageId: MessageId.make(`manual:${name}`),
            text: "Continue where you left off.",
            attachments: [],
            manualContinuationOfRunId: failed.id,
            dispatchMode: { type: "start_immediately" },
            createdBy: "user",
            creationSource: "web",
          }),
        );
        assert.strictEqual(rejected._tag, "Failure", name);
      }
    }),
  );

  it.effect("leaves a delegated child's failure to the parent that was already told", () =>
    Effect.gen(function* () {
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:retry-delegated-child");
      const failed = yield* threadWithFailedRun(threadId, stall);
      const thread = yield* projections.getThread(threadId);
      // What delegate_task creates: a subagent child forked from the parent's subagent node.
      yield* projections.apply({
        id: EventId.make(`lineage:${threadId}`),
        type: "thread.metadata-updated",
        threadId,
        occurredAt: yield* DateTime.now,
        payload: {
          ...thread,
          lineage: {
            parentThreadId: ThreadId.make("thread:retry-parent"),
            relationshipToParent: "subagent",
            rootThreadId: ThreadId.make("thread:retry-parent"),
          },
          forkedFrom: { type: "node", nodeId: NodeId.make("node:retry-parent-subagent") },
        },
      });

      yield* handleTransientRunFailure(yield* liveDeps, { threadId, runId: failed.id });

      const records = yield* projections.getThreadRecords(threadId, ["runs", "messages"]);
      assert.strictEqual(records.runs.length, 1, "no continuation run on the child");
      const note = records.messages.find(
        (message) => message.id === transientRetryNoteId(failed.id),
      );
      assert.include(note?.text ?? "", "not retried automatically");
    }),
  );

  it.effect("never continues a failed run the user had stopped", () =>
    Effect.gen(function* () {
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:retry-stopped");
      const failed = yield* threadWithFailedRun(threadId, stall);
      const now = yield* DateTime.now;
      yield* projections.apply({
        id: EventId.make(`stop:${threadId}`),
        type: "turn-item.updated",
        threadId,
        runId: failed.id,
        occurredAt: now,
        payload: {
          id: TurnItemId.make(`stop:${threadId}`),
          threadId,
          runId: failed.id,
          nodeId: failed.rootNodeId,
          providerThreadId: null,
          providerTurnId: null,
          nativeItemRef: null,
          parentItemId: null,
          ordinal: 4,
          status: "completed",
          title: "Interrupt requested",
          startedAt: now,
          completedAt: now,
          updatedAt: now,
          type: "run_interrupt_request",
          message: "Interrupt requested",
        },
      });

      yield* handleTransientRunFailure(yield* liveDeps, { threadId, runId: failed.id });

      const records = yield* projections.getThreadRecords(threadId, ["runs", "messages"]);
      assert.strictEqual(records.runs.length, 1);
      assert.isUndefined(
        records.messages.find((message) => message.id === transientRetryNoteId(failed.id)),
      );
    }),
  );

  it.effect("leaves a workflow step's run to the workflow's own re-drive", () =>
    Effect.gen(function* () {
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:retry-workflow-step");
      const failed = yield* threadWithFailedRun(threadId, stall, {
        context: workflowPromptContext({
          kind: "workflow",
          workflowRunId: "workflow-run:retry",
          stepId: "step:retry",
          label: "Draft the description",
        }),
      });

      yield* handleTransientRunFailure(yield* liveDeps, { threadId, runId: failed.id });

      const records = yield* projections.getThreadRecords(threadId, ["runs", "messages"]);
      assert.strictEqual(records.runs.length, 1, "the step is not continued a second time");
      assert.isUndefined(
        records.messages.find((message) => message.id === transientRetryNoteId(failed.id)),
      );
    }),
  );
});
