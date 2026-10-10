/**
 * A workflow waiting on the user's answer must show on the V2 shell as pending user input —
 * the signal ThreadNotificationCoordinator and the sidebar watch — and stop showing once the
 * workflow is answered, finished or stopped.
 */
import { assert, it } from "@effect/vitest";
import { CommandId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import { shellPendingRuntimeRequest } from "../orchestration-v2/t3team-workflowAskShell.ts";
import { syncWorkflowAskMirrors } from "../t3team-workflowHostAskMirror.ts";
import { T3TeamThreadWorkflowAsk } from "./t3team-threadWorkflowAsk.ts";
import { createTestThread, makeT3TeamV2TestLayer } from "./t3team-v2Orchestrator.testkit.ts";

const ask = {
  runId: "run-ask",
  correlationId: "corr-ask",
  createdAt: "2026-10-08T10:00:00.000Z",
};

const shellPending = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const shell = yield* projections.getThreadShell(threadId);
    const snapshot = yield* projections.getShellSnapshot();
    const fromSnapshot = snapshot.threads.find((thread) => thread.id === threadId);
    // The per-thread read (live deltas) and the snapshot read must agree.
    assert.deepStrictEqual(fromSnapshot?.pendingRuntimeRequest, shell?.pendingRuntimeRequest);
    return shell?.pendingRuntimeRequest ?? null;
  });

const insertRun = (input: {
  readonly runId: string;
  readonly launchThreadId: string;
  readonly status: string;
  readonly pendingThreadId: string | null;
  readonly pendingKind: string | null;
  readonly updatedAt: string;
}) =>
  Effect.flatMap(
    SqlClient.SqlClient,
    (sql) => sql`
      INSERT INTO workflow_runs (
        run_id, workflow_path, args_json, args_hash, launch_thread_id, project_id,
        model_json, runtime_mode, interaction_mode, status, pending_thread_id,
        pending_correlation_id, pending_kind, wake_at, created_at, updated_at
      ) VALUES (
        ${input.runId}, '/tmp/wf/workflow.ts', '{}', 'args-hash', ${input.launchThreadId},
        'project:t3team-v2', '{}', 'full-access', 'default', ${input.status},
        ${input.pendingThreadId}, ${`corr:${input.runId}`}, ${input.pendingKind}, NULL,
        '2026-10-08T09:00:00.000Z', ${input.updatedAt}
      )
    `,
  );

it.layer(makeT3TeamV2TestLayer("t3team-thread-workflow-ask"))("workflow ask mirror", (it) => {
  it.effect("sets and clears the shell's pending user input without bumping updatedAt", () =>
    Effect.gen(function* () {
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const writer = yield* T3TeamThreadWorkflowAsk;
      const threadId = ThreadId.make("thread:wf-ask");
      yield* createTestThread(threadId);
      const before = yield* projections.getThread(threadId);
      assert.isNull(yield* shellPending(threadId));

      assert.isTrue(yield* writer.setPendingWorkflowAsk(threadId, ask));
      assert.isFalse(yield* writer.setPendingWorkflowAsk(threadId, ask));
      const pending = yield* shellPending(threadId);
      assert.deepStrictEqual(pending, {
        id: RuntimeRequestId.make("t3team-wf-ask:corr-ask"),
        kind: "user_input",
        createdAt: DateTime.makeUnsafe(ask.createdAt),
      });
      const after = yield* projections.getThread(threadId);
      assert.deepStrictEqual(after.pendingWorkflowAsk, ask);
      assert.strictEqual(
        DateTime.toEpochMillis(after.updatedAt),
        DateTime.toEpochMillis(before.updatedAt),
      );

      // Thread commands rewrite the whole record; the mirror must ride along.
      yield* (yield* Orchestrator.OrchestratorV2).dispatch({
        type: "thread.pin",
        commandId: CommandId.make("pin:wf-ask"),
        threadId,
      });
      assert.deepStrictEqual((yield* projections.getThread(threadId)).pendingWorkflowAsk, ask);
      assert.strictEqual((yield* shellPending(threadId))?.kind, "user_input");

      assert.isTrue(yield* writer.setPendingWorkflowAsk(threadId, null));
      assert.isNull(yield* shellPending(threadId));
      assert.isFalse(yield* writer.setPendingWorkflowAsk(ThreadId.make("thread:missing"), ask));
    }),
  );

  it.effect("reconciles the mirror from workflow_runs across ask, answer and other runs", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const writer = yield* T3TeamThreadWorkflowAsk;
      const launch = ThreadId.make("thread:wf-launch");
      const child = ThreadId.make("thread:wf-child");
      yield* createTestThread(launch, "Launch");
      yield* createTestThread(child, "Child");
      const sync = (launchThreadId: string) =>
        syncWorkflowAskMirrors({ sql, writer, launchThreadId });

      // The run asks on its child thread: the child shows a pending question, the launch does not.
      yield* insertRun({
        runId: "run-1",
        launchThreadId: launch,
        status: "suspended",
        pendingThreadId: child,
        pendingKind: "user.input",
        updatedAt: "2026-10-08T10:00:00.000Z",
      });
      yield* sync(launch);
      assert.strictEqual((yield* shellPending(child))?.id, "t3team-wf-ask:corr:run-1");
      assert.isNull(yield* shellPending(launch));

      // A suspended agent turn is not a question for the user.
      yield* insertRun({
        runId: "run-turn",
        launchThreadId: launch,
        status: "suspended",
        pendingThreadId: launch,
        pendingKind: "thread.turn",
        updatedAt: "2026-10-08T10:00:01.000Z",
      });
      yield* sync(launch);
      assert.isNull(yield* shellPending(launch));

      // Another launch's run asks on the same thread later; answering run-1 must not hide it.
      yield* insertRun({
        runId: "run-other",
        launchThreadId: "thread:elsewhere",
        status: "suspended",
        pendingThreadId: child,
        pendingKind: "user.input",
        updatedAt: "2026-10-08T10:00:02.000Z",
      });
      yield* sync(launch);
      assert.strictEqual((yield* shellPending(child))?.id, "t3team-wf-ask:corr:run-other");

      // Answered (the pending columns stay while the run is running again) …
      yield* sql`UPDATE workflow_runs SET status = 'running' WHERE run_id = 'run-other'`;
      yield* sync("thread:elsewhere");
      assert.strictEqual((yield* shellPending(child))?.id, "t3team-wf-ask:corr:run-1");
      // … and the run ends (stopped): the mirror clears.
      yield* sql`
        UPDATE workflow_runs SET status = 'cancelled', pending_thread_id = NULL,
          pending_kind = NULL, pending_correlation_id = NULL
        WHERE run_id = 'run-1'`;
      yield* sync(launch);
      assert.isNull(yield* shellPending(child));
      assert.isNull(
        (yield* (yield* ProjectionStore.ProjectionStoreV2).getThread(child)).pendingWorkflowAsk,
      );
    }),
  );

  it("lets a live runtime request win over the workflow ask", () => {
    const live = {
      id: RuntimeRequestId.make("request-live"),
      kind: "command" as const,
      createdAt: DateTime.makeUnsafe("2026-10-08T11:00:00.000Z"),
    };
    assert.deepStrictEqual(shellPendingRuntimeRequest(live, { pendingWorkflowAsk: ask }), live);
    assert.strictEqual(
      shellPendingRuntimeRequest(null, { pendingWorkflowAsk: ask })?.kind,
      "user_input",
    );
    assert.isNull(shellPendingRuntimeRequest(null, {}));
  });
});
