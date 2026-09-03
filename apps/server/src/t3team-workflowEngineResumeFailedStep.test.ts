/**
 * Resuming a run that failed at an unanswered agent step re-drives THAT step (GHE #403): the row
 * parks on the same ask again with a fresh re-drive budget, the registry gets the pending ask
 * back, and the step's prompt turn is re-issued — no journal replay into a dead `sent` entry.
 */
import { assert, it } from "@effect/vitest";
import { type OrchestrationCommand, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { retainedFailedTurnStep } from "./t3team-toolBrokerWorkflowResumeFailed.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3team-workflowEngineDurability.ts";
import type { LaunchWorkflowRecipeInput } from "./t3team-workflowEngineLaunchTypes.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { resumeFailedTurnStep } from "./t3team-workflowEngineResumeFailedStep.ts";
import type { InterruptedTurnRetry } from "./t3team-workflowEngineTurnRetry.ts";

const projectId = ProjectId.make("proj-resume-failed-step");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const nowIso = (): string => "2026-09-03T07:00:00.000Z";

const repoLayer = it.layer(
  WorkflowRunRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

repoLayer("resumeFailedTurnStep", (it) => {
  it.effect("re-parks the run on its retained step and re-drives it once", () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const runId = "resume-failed-step";
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
        pendingCorrelationId: `${runId}:3`,
        pendingKind: "thread.turn",
        updatedAt: nowIso(),
      });
      yield* repo.setTurnRetries({ runId, turnRetries: 3, updatedAt: nowIso() });
      yield* repo.markFailedRetainingPending({
        runId,
        updatedAt: nowIso(),
        failureReason: "The agent turn failed: Request timed out",
        failureStep: "resume: thread.turn",
      });
      const failed = Option.getOrThrow(yield* repo.getById({ runId }));
      const step = retainedFailedTurnStep(failed);
      assert.deepStrictEqual(step, { threadId: "child-thread", correlationId: `${runId}:3` });

      const registry = makeWorkflowEngineRegistry();
      const dispatched: OrchestrationCommand[] = [];
      const launch: LaunchWorkflowRecipeInput = {
        runId,
        workflowPath: row.workflowPath,
        args: {},
        runsRoot: "/tmp/never-used",
        launchThreadId: "launch-thread",
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        registry,
        dispatch: (command) => {
          dispatched.push(command);
          return Promise.resolve();
        },
        newId: () => "id",
        nowIso,
        lifecycle: makeWorkflowRunLifecycle({ repo, row: failed, nowIso }),
      };
      const redriven: Array<{ threadId: string; correlationId: string }> = [];
      const turnRedrive: InterruptedTurnRetry = {
        settleNoText: () => Effect.void,
        settleFailedTurn: () => Effect.void,
        processTurnRetry: (input) => {
          redriven.push(input);
          const pending = registry.peekPending(input.threadId);
          assert.strictEqual(pending?.redriveArmed, true);
          if (pending !== undefined) {
            const { redriveArmed: _armed, ...judging } = pending;
            registry.setPending(input.threadId, judging);
          }
          return Effect.void;
        },
      };

      yield* resumeFailedTurnStep({ launch, step: step!, runRepository: repo, turnRedrive });

      const resumed = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(resumed.status, "suspended");
      assert.strictEqual(resumed.pendingCorrelationId, `${runId}:3`);
      assert.strictEqual(resumed.turnRetries, 0);
      assert.ok(registry.getRun(runId) !== undefined, "controller re-registered");
      assert.deepStrictEqual(registry.peekPending("child-thread"), {
        runId,
        correlationId: `${runId}:3`,
        kind: "thread.turn",
        turnRetries: 0,
      });
      assert.deepStrictEqual(redriven, [{ threadId: "child-thread", correlationId: `${runId}:3` }]);

      // A second resume of the same failed run finds the controller already claimed.
      const again = yield* resumeFailedTurnStep({
        launch,
        step: step!,
        runRepository: repo,
        turnRedrive,
      }).pipe(Effect.flip);
      assert.match(again, /already being resumed/);
      assert.strictEqual(redriven.length, 1);
    }),
  );

  it.effect("a body-thrown failure (pending cleared) is not a retained step", () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const runId = "resume-failed-body";
      yield* repo.upsert(
        buildRunningWorkflowRunRow({
          runId,
          workflowPath: "/tmp/never-read.workflow.ts",
          args: {},
          launchThreadId: "launch-thread",
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          nowIso: nowIso(),
        }),
      );
      yield* repo.clearPending({
        runId,
        status: "failed",
        updatedAt: nowIso(),
        failureReason: "TypeError: boom",
        failureStep: "launch",
      });
      assert.strictEqual(
        retainedFailedTurnStep(Option.getOrThrow(yield* repo.getById({ runId }))),
        null,
      );
    }),
  );
});
