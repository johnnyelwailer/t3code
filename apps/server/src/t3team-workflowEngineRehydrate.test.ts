/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
// @effect-diagnostics nodeBuiltinImport:off - integration test reads a workflow fixture + temp dir.
/**
 * Real-path proof for {@link rehydrateSuspendedWorkflowRuns} — the boot rehydration this test
 * calls DIRECTLY (not a hand-rolled re-implementation, unlike the older durability/scheduler
 * tests' `rebuildFromDb` helpers). It boots the real `WorkflowRunRepository` +
 * `WorkflowJournalStore` + `T3TeamWorkflowEngineRegistry` + `T3TeamWorkflowScheduler` layers
 * over an in-memory SQLite DB, plus a stub `OrchestrationEngineService` (dispatch is a no-op
 * success; no domain-event reactor is under test here — that is
 * `t3team-workflowEngineReactor.integration.test.ts`'s job).
 *
 * Three cases:
 *   1. A run suspended on `askUser` (DB-only, in-memory registry discarded) is rehydrated: the
 *      pending ask reappears in the registry, and resolving it drives the run to completion.
 *   2. A `suspended` row with no recorded pending ask (corrupt/partial write) is skipped, not
 *      crashed.
 *   3. A `sleeping` run whose deadline has already passed by rehydration time is rebuilt and the
 *      scheduler's real re-arm fires the past-due wake without a manual resume.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { afterAll } from "vite-plus/test";

import { ServerConfig } from "./config.ts";
import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowJournalStoreLive } from "./persistence/Layers/SqliteJournalStore.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3team-workflowEngineDurability.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { rehydrateSuspendedWorkflowRuns } from "./t3team-workflowEngineRehydrate.ts";
import { workflowAdmissionQueue } from "./t3team-workflowAdmissionQueue.ts";
import { setWorkflowEphemeralConcurrencyPolicy } from "./t3team-workflowEphemeralConcurrencyPolicy.ts";
import {
  makeWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistryLive,
} from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowSchedulerLive } from "./t3team-workflowScheduler.ts";

const reviewWorkflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3team-exampleReview.workflow.ts", import.meta.url),
);
const timerWorkflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3team-exampleTimer.workflow.ts", import.meta.url),
);
const cwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-rehydrate-"));
afterAll(() => NodeFS.rmSync(cwd, { recursive: true, force: true }));

const projectId = ProjectId.make("proj-rehydrate");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const nowIso = (): string => "2026-06-08T00:00:00.000Z";

// A no-op stub: no domain-event reactor is under test in this file, so `dispatch` just
// succeeds and `streamDomainEvents` is never subscribed.
const stubEngine: OrchestrationEngineShape = {
  readEvents: () => Stream.empty,
  dispatch: () => Effect.succeed({ sequence: 0 }),
  streamDomainEvents: Stream.never,
  subscribeDomainEvents: Effect.acquireRelease(Effect.succeed(Stream.empty), () => Effect.void),
  latestSequence: Effect.succeed(0),
};
const OrchestrationEngineTestLive = Layer.succeed(OrchestrationEngineService, stubEngine);

it.live("rehydrates durable queued runs and promotes them when FIFO capacity opens", () =>
  Effect.scoped(
    Effect.gen(function* () {
      workflowAdmissionQueue.resetForTests();
      setWorkflowEphemeralConcurrencyPolicy({ maxActiveSteps: 1 });
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          workflowAdmissionQueue.resetForTests();
          setWorkflowEphemeralConcurrencyPolicy({ maxActiveSteps: 8 });
        }),
      );
      yield* Effect.promise(() => workflowAdmissionQueue.acquire("restart-blocker"));
      const repo = yield* WorkflowRunRepository;
      const runId = "rehydrate-queued";
      const workflowPath = NodePath.join(cwd, "rehydrate-queued.workflow.ts");
      NodeFS.writeFileSync(
        workflowPath,
        'import { Schema } from "effect"; export const Inputs = Schema.Struct({}); export const Outputs = Schema.Struct({ ok: Schema.Boolean }); export const meta = { name: "queued", inputs: Inputs, outputs: Outputs } as const; return { ok: true };',
      );
      yield* repo.upsert({
        ...buildRunningWorkflowRunRow({
          runId,
          workflowPath,
          args: {},
          launchThreadId: "queued-thread",
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          origin: "ephemeral",
          nowIso: nowIso(),
        }),
        status: "queued",
      });

      yield* rehydrateSuspendedWorkflowRuns();
      yield* waitUntil(
        () => workflowAdmissionQueue.snapshot().queued.includes(runId),
        "queued run to rebuild its admission waiter",
      );
      workflowAdmissionQueue.release("restart-blocker");
      yield* waitUntil(
        () => workflowAdmissionQueue.snapshot().active.length === 0,
        "queued run to finish after promotion",
      );
      assert.strictEqual(Option.getOrThrow(yield* repo.getById({ runId })).status, "completed");
    }),
  ).pipe(Effect.provide(TestLayer)),
);

// Mirrors `WorkflowEngineDurabilityLive` in server.ts / t3team-server.ts, over the in-memory
// SQLite layer instead of the real one.
const WorkflowEngineDurabilityTestLive = T3TeamWorkflowSchedulerLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      T3TeamWorkflowEngineRegistryLive,
      WorkflowRunRepositoryLive,
      WorkflowJournalStoreLive,
    ),
  ),
  Layer.provide(SqlitePersistenceMemory),
);

// Exactly the six services `rehydrateSuspendedWorkflowRuns` requires.
const TestLayer = Layer.mergeAll(
  WorkflowEngineDurabilityTestLive,
  OrchestrationEngineTestLive,
  ServerConfig.layerTest(cwd, { prefix: "t3-rehydrate-test-" }),
).pipe(Layer.provideMerge(NodeServices.layer));

/** Poll an in-memory predicate until it holds or times out. Used only by the sleeping-run case,
 * which waits on a REAL scheduler timer (see that test for why `it.live` is required there). */
const waitUntil = (predicate: () => boolean, label: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (let i = 0; i < 200; i += 1) {
      if (predicate()) return;
      yield* Effect.sleep(Duration.millis(25));
    }
    return yield* Effect.die(new Error(`timed out waiting for: ${label}`));
  });

it.effect(
  "rehydrates a run suspended on askUser: the pending ask reappears and resolving it completes the run",
  () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const store = yield* WorkflowJournalStore;
      const config = yield* ServerConfig;
      const runsRoot = NodePath.join(config.cwd, ".t3team-runs");

      const runId = "rehydrate-askuser";
      const launchThreadId = "rehydrate-launch-askuser";
      const args = { prTitle: "Fix the billing rounding bug" };

      // Launch through a THROWAWAY registry (this uptime only) and resolve the agent turn
      // in-process, so the DB ends up with a run suspended on `askUser` — same setup the
      // durability test uses, but here the restart path calls the REAL rehydrate function.
      const throwaway = makeWorkflowEngineRegistry();
      let seq = 0;
      const launched = yield* Effect.promise(() =>
        launchWorkflowRecipe({
          runId,
          workflowPath: reviewWorkflowPath,
          args,
          runsRoot,
          launchThreadId,
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          registry: throwaway,
          dispatch: () => Promise.resolve(),
          newId: () => `id-${(seq += 1)}`,
          nowIso,
          store,
          lifecycle: makeWorkflowRunLifecycle({
            repo,
            row: buildRunningWorkflowRunRow({
              runId,
              workflowPath: reviewWorkflowPath,
              args,
              launchThreadId,
              projectId,
              modelSelection,
              runtimeMode: "full-access",
              interactionMode: "default",
              nowIso: nowIso(),
            }),
            nowIso,
          }),
        }),
      );
      assert.strictEqual(launched.status, "suspended");

      const agentAsk = throwaway.takePending(`${runId}:1`);
      assert.strictEqual(agentAsk?.kind, "thread.turn");
      yield* Effect.promise(() =>
        throwaway.getRun(runId)!.resume(agentAsk!.correlationId, { summary: "Looks safe." }),
      );

      const suspendedRow = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(suspendedRow.status, "suspended");
      assert.strictEqual(suspendedRow.pendingThreadId, launchThreadId);
      assert.strictEqual(suspendedRow.pendingKind, "user.input");

      // ── The real boot path: throw away `throwaway`, rehydrate into the layer's registry ──
      yield* rehydrateSuspendedWorkflowRuns();

      const registry = yield* T3TeamWorkflowEngineRegistry;
      const userAsk = registry.peekPending(launchThreadId);
      assert.strictEqual(userAsk?.kind, "user.input");
      assert.strictEqual(userAsk?.correlationId, suspendedRow.pendingCorrelationId);
      assert.isDefined(registry.getRun(runId));

      yield* Effect.promise(() =>
        registry.getRun(runId)!.resume(userAsk!.correlationId, { merge: true }),
      );

      const finalRow = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(finalRow.status, "completed");
      assert.isUndefined(registry.getRun(runId));
    }).pipe(Effect.provide(TestLayer)),
);

it.effect("skips a suspended row with no recorded pending ask instead of crashing", () =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const runId = "rehydrate-skip-no-pending";

    // A corrupt/partial write: status flipped to `suspended` but the pending columns never
    // landed. Boot rehydration must log + skip this row, never throw.
    yield* repo.upsert({
      ...buildRunningWorkflowRunRow({
        runId,
        workflowPath: reviewWorkflowPath,
        args: { prTitle: "n/a" },
        launchThreadId: "rehydrate-skip-thread",
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        nowIso: nowIso(),
      }),
      status: "suspended",
    });

    yield* rehydrateSuspendedWorkflowRuns();

    const registry = yield* T3TeamWorkflowEngineRegistry;
    assert.isUndefined(registry.getRun(runId));
    const row = Option.getOrThrow(yield* repo.getById({ runId }));
    assert.strictEqual(row.status, "suspended"); // untouched — rehydrate only reads + skips
  }).pipe(Effect.provide(TestLayer)),
);

// `it.live` (real clock): the production scheduler layer (`T3TeamWorkflowSchedulerLive`) has no
// clock-injection seam, so proving the past-due catch-up arm requires a real ~1s wait for the
// `MIN_DUE_DELAY_MS` floor to fire. Under the default TestClock this would never tick.
it.live(
  "rehydrates a sleeping run and the scheduler's real re-arm fires the already-past-due wake",
  () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const store = yield* WorkflowJournalStore;
      const config = yield* ServerConfig;
      const runsRoot = NodePath.join(config.cwd, ".t3team-runs");

      const runId = "rehydrate-sleeping";
      const launchThreadId = "rehydrate-launch-sleeping";
      // A tiny delay: by the time this test finishes its own launch + assertions, the deadline
      // is already in the past — exercising the downtime catch-up path, not a fresh future arm.
      const args = { delayMs: 5 };

      const throwaway = makeWorkflowEngineRegistry();
      const launched = yield* Effect.promise(() =>
        launchWorkflowRecipe({
          runId,
          workflowPath: timerWorkflowPath,
          args,
          runsRoot,
          launchThreadId,
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          registry: throwaway,
          dispatch: () => Promise.resolve(),
          newId: () => "id-1",
          nowIso,
          store,
          lifecycle: makeWorkflowRunLifecycle({
            repo,
            row: buildRunningWorkflowRunRow({
              runId,
              workflowPath: timerWorkflowPath,
              args,
              launchThreadId,
              projectId,
              modelSelection,
              runtimeMode: "full-access",
              interactionMode: "default",
              nowIso: nowIso(),
            }),
            nowIso,
          }),
        }),
      );
      assert.strictEqual(launched.status, "suspended"); // a clock park reports suspended too

      const sleepingRow = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(sleepingRow.status, "sleeping");
      assert.isNotNull(sleepingRow.wakeAt);

      // Let real wall-clock time pass the tiny deadline before rehydrating.
      yield* Effect.sleep(Duration.millis(50));

      // The real boot path: rebuilds the resume closure AND arms the real scheduler, which finds
      // the deadline already due and fires it at the `MIN_DUE_DELAY_MS` floor, with nobody here
      // calling `resume` by hand.
      yield* rehydrateSuspendedWorkflowRuns();

      const registry = yield* T3TeamWorkflowEngineRegistry;
      yield* waitUntil(
        () => registry.getRun(runId) === undefined,
        "the past-due sleeping run to wake and complete",
      );

      const finalRow = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(finalRow.status, "completed");
      assert.isNull(finalRow.wakeAt);
    }).pipe(Effect.provide(TestLayer)),
);
