/**
 * `t3team.orchestration.pause` / `.stop` — the agent's controls over its own runs (GHE #403 §4):
 * same choreography as the card's buttons (durable status, registry pending, child interrupts,
 * the run-level activity), scoped to the calling thread.
 */
import { assert, it } from "@effect/vitest";
import {
  type OrchestrationCommand,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { makeWorkflowControlToolHandlers } from "./t3team-toolBrokerWorkflowControlTool.ts";
import { buildRunningWorkflowRunRow } from "./t3team-workflowEngineDurability.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { controlWorkflowRun } from "./t3team-workflowRunControl.ts";
import type { InterruptedTurnRetry } from "./t3team-workflowEngineTurnRetry.ts";

const projectId = ProjectId.make("proj-control-tool");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const launchThreadId = ThreadId.make("control-launch-thread");
const otherThreadId = ThreadId.make("control-other-thread");
const nowIso = (): string => "2026-09-03T06:00:00.000Z";

const repoLayer = it.layer(
  WorkflowRunRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

repoLayer("t3team.orchestration.pause / stop", (it) => {
  const seed = (runId: string) =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      yield* repo.upsert(
        buildRunningWorkflowRunRow({
          runId,
          workflowPath: "/tmp/never-read.workflow.ts",
          args: {},
          launchThreadId: String(launchThreadId),
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          nowIso: nowIso(),
        }),
      );
      yield* repo.setPending({
        runId,
        pendingThreadId: `${runId}:child`,
        pendingCorrelationId: `${runId}:2`,
        pendingKind: "thread.turn",
        updatedAt: nowIso(),
      });
      const registry = makeWorkflowEngineRegistry();
      let cancelled = false;
      registry.registerRun(runId, {
        resume: () => Promise.resolve(),
        cancel: () => {
          cancelled = true;
        },
      });
      registry.registerChildThread(runId, `${runId}:child`);
      registry.setPending(`${runId}:child`, {
        runId,
        correlationId: `${runId}:2`,
        kind: "thread.turn",
      });
      const dispatched: OrchestrationCommand[] = [];
      const redriven: Array<{ threadId: string; correlationId: string }> = [];
      let rearmed = 0;
      const turnRedrive: InterruptedTurnRetry = {
        settleNoText: () => Effect.void,
        settleFailedTurn: () => Effect.void,
        processTurnRetry: (input) => {
          redriven.push(input);
          return Effect.void;
        },
      };
      const controlDeps = {
        repo,
        registry,
        rearmScheduler: () => {
          rearmed += 1;
          return Promise.resolve();
        },
        dispatch: (command: OrchestrationCommand) => {
          dispatched.push(command);
          return Effect.succeed({ sequence: dispatched.length });
        },
        turnRedrive,
      };
      const handlers = makeWorkflowControlToolHandlers(controlDeps);
      return {
        repo,
        registry,
        handlers,
        dispatched,
        wasCancelled: () => cancelled,
        rearmed: () => rearmed,
        redriven,
        controlDeps,
      };
    });

  it.effect("pause parks a suspended run, drops its registry ask, and posts the run activity", () =>
    Effect.gen(function* () {
      const runId = "ctl-pause";
      const h = yield* seed(runId);
      const value = yield* h.handlers(launchThreadId).controlWorkflowRun("pause", { runId });

      assert.strictEqual(value.status, "paused");
      assert.match(value.hint, /t3team\.orchestration\.resume/);
      assert.strictEqual(Option.getOrThrow(yield* h.repo.getById({ runId })).status, "paused");
      assert.strictEqual(h.registry.peekPending(`${runId}:child`), undefined);
      assert.strictEqual(h.rearmed(), 1);
      const activity = h.dispatched.find((command) => command.type === "thread.activity.append");
      assert.ok(activity !== undefined && activity.type === "thread.activity.append");
      assert.strictEqual(activity.activity.summary, "Workflow paused");
      assert.strictEqual(String(activity.threadId), String(launchThreadId));
    }),
  );

  it.effect("card resume restores and immediately re-drives a paused thread.turn step", () =>
    Effect.gen(function* () {
      const runId = "ctl-resume-turn";
      const h = yield* seed(runId);
      yield* h.repo.setTurnRetries({ runId, turnRetries: 2, updatedAt: nowIso() });
      yield* h.handlers(launchThreadId).controlWorkflowRun("pause", { runId });
      const paused = Option.getOrThrow(yield* h.repo.getById({ runId }));

      const value = yield* controlWorkflowRun(
        { ...h.controlDeps, nowIso, stopOrigin: "user" },
        paused,
        { threadId: String(launchThreadId), action: "resume" },
      );

      assert.strictEqual(value.status, "suspended");
      assert.deepStrictEqual(h.registry.peekPending(`${runId}:child`), {
        runId,
        correlationId: `${runId}:2`,
        kind: "thread.turn",
        turnRetries: 2,
        redriveArmed: true,
      });
      assert.deepStrictEqual(h.redriven, [
        { threadId: `${runId}:child`, correlationId: `${runId}:2` },
      ]);
    }),
  );

  it.effect("stop cancels the run and interrupts its child turns as automation, not the user", () =>
    Effect.gen(function* () {
      const runId = "ctl-stop";
      const h = yield* seed(runId);
      const value = yield* h.handlers(launchThreadId).controlWorkflowRun("stop", { runId });

      assert.strictEqual(value.status, "cancelled");
      assert.strictEqual(h.wasCancelled(), true);
      const row = Option.getOrThrow(yield* h.repo.getById({ runId }));
      assert.strictEqual(row.status, "cancelled");
      assert.strictEqual(row.pendingCorrelationId, null);
      const interrupt = h.dispatched.find((command) => command.type === "thread.turn.interrupt");
      assert.ok(interrupt !== undefined && interrupt.type === "thread.turn.interrupt");
      assert.strictEqual(String(interrupt.threadId), `${runId}:child`);
      assert.strictEqual(interrupt.t3teamStopOrigin, "system");
      const activity = h.dispatched.find((command) => command.type === "thread.activity.append");
      assert.ok(activity !== undefined && activity.type === "thread.activity.append");
      assert.strictEqual(activity.activity.summary, "Workflow stopped");
    }),
  );

  it.effect("another thread's run and an unknown id answer identically", () =>
    Effect.gen(function* () {
      const runId = "ctl-scope";
      const h = yield* seed(runId);
      const foreign = yield* h
        .handlers(otherThreadId)
        .controlWorkflowRun("stop", { runId })
        .pipe(Effect.flip);
      const unknown = yield* h
        .handlers(launchThreadId)
        .controlWorkflowRun("stop", { runId: "ctl-nope" })
        .pipe(Effect.flip);
      assert.match(foreign, /No orchestration run found for runId 'ctl-scope'/);
      assert.match(unknown, /No orchestration run found for runId 'ctl-nope'/);
      // Nothing moved.
      assert.strictEqual(Option.getOrThrow(yield* h.repo.getById({ runId })).status, "suspended");
      assert.strictEqual(h.dispatched.length, 0);
    }),
  );

  it.effect("pause refuses a run that is not at a parked boundary", () =>
    Effect.gen(function* () {
      const runId = "ctl-pause-running";
      const h = yield* seed(runId);
      yield* h.repo.setStatus({ runId, status: "running", updatedAt: nowIso() });
      const error = yield* h
        .handlers(launchThreadId)
        .controlWorkflowRun("pause", { runId })
        .pipe(Effect.flip);
      assert.match(error, /only while the workflow is waiting or scheduled/);
    }),
  );

  it.effect("requires a runId", () =>
    Effect.gen(function* () {
      const h = yield* seed("ctl-no-id");
      const error = yield* h
        .handlers(launchThreadId)
        .controlWorkflowRun("pause", {})
        .pipe(Effect.flip);
      assert.match(error, /requires a runId/);
    }),
  );

  // GHE #411 §2: a retried pause on an already-paused run must succeed, not error.
  it.effect("pause is idempotent on an already-paused run", () =>
    Effect.gen(function* () {
      const runId = "ctl-pause-idempotent";
      const h = yield* seed(runId);
      yield* h.handlers(launchThreadId).controlWorkflowRun("pause", { runId });
      const paused = Option.getOrThrow(yield* h.repo.getById({ runId }));

      const value = yield* controlWorkflowRun(
        { ...h.controlDeps, nowIso, stopOrigin: "system" },
        paused,
        { threadId: String(launchThreadId), action: "pause" },
      );

      assert.strictEqual(value.status, "paused");
      assert.strictEqual(Option.getOrThrow(yield* h.repo.getById({ runId })).status, "paused");
    }),
  );

  // GHE #411 §1 (TOCTOU): a stale `run` snapshot must not overwrite a row that already settled
  // between the caller's read and `controlWorkflowRun`'s write.
  it.effect("pause on a run that finished since it was read fails instead of overwriting it", () =>
    Effect.gen(function* () {
      const runId = "ctl-pause-toctou";
      const h = yield* seed(runId);
      const staleRun = Option.getOrThrow(yield* h.repo.getById({ runId }));
      // The row completes behind the caller's back before the write lands.
      yield* h.repo.clearPending({ runId, status: "completed", updatedAt: nowIso() });

      const error = yield* controlWorkflowRun(
        { ...h.controlDeps, nowIso, stopOrigin: "system" },
        staleRun,
        { threadId: String(launchThreadId), action: "pause" },
      ).pipe(Effect.flip);

      assert.match(error, /Workflow already finished \(completed\)/);
      assert.strictEqual(Option.getOrThrow(yield* h.repo.getById({ runId })).status, "completed");
    }),
  );

  it.effect("stop on a run that finished since it was read fails instead of overwriting it", () =>
    Effect.gen(function* () {
      const runId = "ctl-stop-toctou";
      const h = yield* seed(runId);
      const staleRun = Option.getOrThrow(yield* h.repo.getById({ runId }));
      yield* h.repo.clearPending({ runId, status: "failed", updatedAt: nowIso() });

      const error = yield* controlWorkflowRun(
        { ...h.controlDeps, nowIso, stopOrigin: "system" },
        staleRun,
        { threadId: String(launchThreadId), action: "stop" },
      ).pipe(Effect.flip);

      assert.match(error, /Workflow already finished \(failed\)/);
      assert.strictEqual(Option.getOrThrow(yield* h.repo.getById({ runId })).status, "failed");
    }),
  );
});
