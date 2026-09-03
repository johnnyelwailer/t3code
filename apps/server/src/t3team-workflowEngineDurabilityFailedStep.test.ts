/**
 * A host-detected step failure keeps the run's pending ask on the durable row (GHE #403), so
 * `t3team.orchestration.resume` can re-drive exactly that step; a body-thrown failure still
 * clears it, as before.
 */
import { assert, it } from "@effect/vitest";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3team-workflowEngineDurability.ts";

const projectId = ProjectId.make("proj-failed-step");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const nowIso = (): string => "2026-09-03T00:00:00.000Z";

const repoLayer = it.layer(
  WorkflowRunRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

repoLayer("workflow run failure — retained pending step", (it) => {
  const seedParked = (runId: string) =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const row = buildRunningWorkflowRunRow({
        runId,
        workflowPath: "/tmp/never-read.workflow.ts",
        args: {},
        launchThreadId: "launch-thread",
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        nowIso: nowIso(),
      });
      yield* repo.upsert(row);
      yield* repo.setPending({
        runId,
        pendingThreadId: "child-thread",
        pendingCorrelationId: `${runId}:4`,
        pendingKind: "thread.turn",
        updatedAt: nowIso(),
      });
      return { repo, row };
    });

  it.effect("recordFailed with retainPending keeps the pending ask and records the reason", () =>
    Effect.gen(function* () {
      const runId = "failed-retain";
      const { repo, row } = yield* seedParked(runId);
      const lifecycle = makeWorkflowRunLifecycle({ repo, row, nowIso });

      yield* Effect.promise(() =>
        lifecycle.recordFailed({
          reason: "The agent turn failed: Request timed out",
          step: "resume: thread.turn (Pick next task)",
          retainPending: true,
        }),
      );

      const failed = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(failed.status, "failed");
      assert.strictEqual(failed.pendingKind, "thread.turn");
      assert.strictEqual(failed.pendingThreadId, "child-thread");
      assert.strictEqual(failed.pendingCorrelationId, `${runId}:4`);
      assert.strictEqual(failed.failureReason, "The agent turn failed: Request timed out");
      assert.strictEqual(failed.failureStep, "resume: thread.turn (Pick next task)");
    }),
  );

  it.effect("recordFailed without retainPending still clears the pending ask", () =>
    Effect.gen(function* () {
      const runId = "failed-clear";
      const { repo, row } = yield* seedParked(runId);
      const lifecycle = makeWorkflowRunLifecycle({ repo, row, nowIso });

      yield* Effect.promise(() => lifecycle.recordFailed({ reason: "boom", step: "launch" }));

      const failed = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(failed.status, "failed");
      assert.strictEqual(failed.pendingKind, null);
      assert.strictEqual(failed.pendingCorrelationId, null);
    }),
  );

  it.effect("a retained failed step parks again as suspended when resumed", () =>
    Effect.gen(function* () {
      const runId = "failed-resume-park";
      const { repo } = yield* seedParked(runId);
      yield* repo.markFailedRetainingPending({
        runId,
        updatedAt: nowIso(),
        failureReason: "The agent turn failed: gateway down",
        failureStep: "resume: thread.turn",
      });
      // What `resumeFailedTurnStep` does through the lifecycle: the same ask, suspended again.
      yield* repo.setPending({
        runId,
        pendingThreadId: "child-thread",
        pendingCorrelationId: `${runId}:4`,
        pendingKind: "thread.turn",
        updatedAt: nowIso(),
      });
      const resumed = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(resumed.status, "suspended");
      assert.strictEqual(resumed.pendingCorrelationId, `${runId}:4`);
    }),
  );

  it.effect("never resurrects a cancelled run as failed", () =>
    Effect.gen(function* () {
      const runId = "failed-after-cancel";
      const { repo } = yield* seedParked(runId);
      yield* repo.clearPending({ runId, status: "cancelled", updatedAt: nowIso() });
      yield* repo.markFailedRetainingPending({
        runId,
        updatedAt: nowIso(),
        failureReason: "late",
        failureStep: "resume",
      });
      assert.strictEqual(Option.getOrThrow(yield* repo.getById({ runId })).status, "cancelled");
    }),
  );
});
