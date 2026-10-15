import { assert, describe, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  type OrchestrationV2ProviderFailure,
  type OrchestrationV2Run,
  RunId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import { replaceFeatureFlagDatabaseValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { afterEach } from "vite-plus/test";

import * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "./orchestration-v2/ProjectionStore.ts";
import {
  autoResumeDelayMs,
  autoResumeNoteText,
  episodeRootRunId,
} from "./t3team-transientAutoResume.ts";
import { isTransientAutoResumeEnabled } from "./t3team-transientAutoResumeFlag.ts";
import {
  listDueTransientRecoveryThreads,
  sweepTransientRecoveries,
  type TransientRecoverySweepDeps,
} from "./t3team-transientAutoResumeSweep.ts";
import { TRANSIENT_RETRY_TURN_ITEM_TYPES } from "./t3team-threadTransientTurnRetryOwner.ts";
import {
  transientRetryMessageId,
  transientRetryNoteId,
} from "./t3team-threadTransientTurnRetryPlan.ts";
import {
  handleTransientRunFailure,
  type TransientRetryDeps,
} from "./t3team-threadTransientTurnRetryReactor.ts";
import { T3TeamThreadMessageRecorder } from "./t3team-v2/t3team-threadMessageRecorder.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";

const queueFull: OrchestrationV2ProviderFailure = {
  class: "transport_error",
  message: "The request queue is full.",
  code: null,
  retryable: true,
};

const deps = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const recorder = yield* T3TeamThreadMessageRecorder;
  const sql = yield* SqlClient.SqlClient;
  const dispatch = (command: Parameters<TransientRetryDeps["dispatch"]>[0]) =>
    orchestrator.dispatch(command).pipe(Effect.mapError(String));
  const retry: TransientRetryDeps = {
    loadRecords: (threadId, runId) =>
      projections
        .getThreadRecords(threadId, ["runs", "turnItems", "messages"], {
          turnItemRunId: runId,
          turnItemTypes: TRANSIENT_RETRY_TURN_ITEM_TYPES,
          messageRunIds: [runId],
          messageRoles: ["user"],
        })
        .pipe(Effect.orDie),
    dispatch,
    recordNote: ({ threadId, messageId, text }) =>
      recorder.record({ threadId, messageId, role: "system", text }).pipe(Effect.mapError(String)),
    delayMs: () => 0,
    autoResume: () => true,
  };
  const sweep: TransientRecoverySweepDeps = {
    enabled: () => true,
    listDue: (nowIso) =>
      listDueTransientRecoveryThreads(nowIso).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.orDie,
      ),
    loadThread: (threadId) => projections.getThreadRecords(threadId, ["runs"]).pipe(Effect.orDie),
    dispatch,
  };
  return { retry, sweep, projections, dispatch };
});

/** Marks `run` FAILED with `failure` on its root node. */
const failRun = (run: OrchestrationV2Run, failure: OrchestrationV2ProviderFailure) =>
  Effect.gen(function* () {
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const now = yield* DateTime.now;
    const base = { threadId: run.threadId, runId: run.id, occurredAt: now };
    yield* projections.apply({
      ...base,
      id: EventId.make(`failed:${run.id}`),
      type: "run.updated",
      payload: { ...run, status: "failed", startedAt: now, completedAt: now },
    });
    yield* projections.apply({
      ...base,
      id: EventId.make(`error:${run.id}`),
      type: "turn-item.updated",
      payload: {
        id: TurnItemId.make(`error:${run.id}`),
        threadId: run.threadId,
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
  });

const threadWithFailedRun = (threadId: ThreadId) =>
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
    const run = (yield* projections.getThreadRecords(threadId, ["runs"])).runs.at(-1)!;
    yield* failRun(run, queueFull);
    return run;
  });

it.layer(makeT3TeamV2TestLayer("t3team-transient-auto-resume"))(
  "transient auto-resume on V2",
  (it) => {
    it.effect("arms instead of sleeping, resumes from the durable sweep, keeps one note row", () =>
      Effect.gen(function* () {
        const { retry, sweep, projections } = yield* deps;
        const threadId = ThreadId.make("thread:auto-resume");
        const failed = yield* threadWithFailedRun(threadId);

        yield* handleTransientRunFailure(retry, { threadId, runId: failed.id });
        const armed = yield* projections.getThreadRecords(threadId, ["runs"]);
        assert.strictEqual(armed.runs.length, 1, "no in-memory continuation");
        assert.deepInclude(armed.thread.transientRecovery, { runId: failed.id, autoResume: true });
        assert.isString(armed.thread.transientRecovery?.nextTryAt);

        assert.strictEqual(yield* sweepTransientRecoveries(sweep), 1);
        const resumed = yield* projections.getThreadRecords(threadId, ["runs"]);
        const retryRun = resumed.runs.find(
          (run) => run.userMessageId === transientRetryMessageId(failed.id),
        );
        assert.ok(retryRun, "the sweep continued the failed run");
        assert.strictEqual(resumed.thread.transientRecovery?.nextTryAt, null, "disarmed");
        assert.strictEqual(yield* sweepTransientRecoveries(sweep), 0, "no second continuation");

        // The continuation fails the same way: the same note row is rewritten in place.
        yield* failRun(retryRun, queueFull);
        yield* handleTransientRunFailure(retry, { threadId, runId: retryRun.id });
        const cycled = yield* projections.getThreadRecords(threadId, ["messages"]);
        const notes = cycled.messages.filter((message) => message.role === "system");
        assert.deepStrictEqual(
          notes.map((note) => note.id),
          [transientRetryNoteId(failed.id)],
        );
        assert.include(notes[0]?.text ?? "", "Retrying (2/3)");
        assert.strictEqual(cycled.thread.transientRecovery?.runId, retryRun.id);
      }),
    );

    it.effect("never resumes once the user turned auto-resume off", () =>
      Effect.gen(function* () {
        const { retry, sweep, projections, dispatch } = yield* deps;
        const threadId = ThreadId.make("thread:auto-resume-off");
        const failed = yield* threadWithFailedRun(threadId);
        yield* handleTransientRunFailure(retry, { threadId, runId: failed.id });
        yield* dispatch({
          type: "thread.metadata.update",
          commandId: CommandId.make("user:auto-resume-off"),
          threadId,
          transientRecovery: { runId: failed.id, autoResume: false },
        });
        const { thread } = yield* projections.getThreadRecords(threadId, ["runs"]);
        assert.strictEqual(thread.transientRecovery?.autoResume, false);
        assert.isString(thread.transientRecovery?.nextTryAt, "the armed time is kept");

        // The layer is shared: other threads may be due; this one must not be.
        assert.notInclude(yield* sweep.listDue(DateTime.formatIso(yield* DateTime.now)), threadId);
        yield* sweepTransientRecoveries(sweep);
        const { runs } = yield* projections.getThreadRecords(threadId, ["runs"]);
        assert.strictEqual(runs.length, 1, "the thread stays failed");
      }),
    );

    it.effect("does nothing while the flag is off", () =>
      Effect.gen(function* () {
        const { sweep } = yield* deps;
        assert.strictEqual(yield* sweepTransientRecoveries({ ...sweep, enabled: () => false }), 0);
      }),
    );
  },
);

describe("auto-resume policy", () => {
  afterEach(() => replaceFeatureFlagDatabaseValues(new Map()));

  it("backs off 5m, 10m, 15m, then every 30m", () => {
    assert.deepStrictEqual(
      [1, 2, 3, 4, 9].map(autoResumeDelayMs),
      [300_000, 600_000, 900_000, 1_800_000, 1_800_000],
    );
    assert.strictEqual(
      autoResumeNoteText("Gateway timeout", 3, 600_000),
      "Gateway timeout — automatic retries exhausted (3 attempts); auto-resume tries again in ~10m",
    );
  });

  it("keys a retry chain to its first failed run", () => {
    const run = (id: string, ordinal: number, userMessageId: string) => ({
      id: RunId.make(id),
      ordinal,
      userMessageId: MessageId.make(userMessageId),
    });
    const runs = [
      run("original", 1, "user-message"),
      run("retry-1", 2, transientRetryMessageId(RunId.make("original"))),
      run("retry-2", 3, transientRetryMessageId(RunId.make("retry-1"))),
    ];
    assert.strictEqual(episodeRootRunId(runs, RunId.make("retry-2")), "original");
    assert.strictEqual(episodeRootRunId(runs, RunId.make("original")), "original");
  });

  it("defaults on; env and the feature_flags row override", () => {
    assert.isTrue(isTransientAutoResumeEnabled(() => undefined));
    assert.isFalse(
      isTransientAutoResumeEnabled((key) =>
        key === "NEXI_FF_TRANSIENT_AUTO_RESUME" ? "off" : undefined,
      ),
    );
    replaceFeatureFlagDatabaseValues(new Map([["TRANSIENT_AUTO_RESUME", false]]));
    assert.isFalse(isTransientAutoResumeEnabled(() => undefined));
  });
});
