// @effect-diagnostics nodeBuiltinImport:off - integration test reads a workflow fixture + temp dir.
/**
 * `waitForAny` end to end over the real run repository, SQLite journal, signal store, run
 * controller and delivery port (fake thread host only). The body is the change-request babysitter
 * loop: each iteration re-binds three sources and parks on the first of four branches.
 *
 *   1. A parked any-wait resumes when a NON-first branch fires, and the journal records that
 *      branch as the winner.
 *   2. The event of a branch that lost — delivered against the stale park — answers the wait the
 *      run parked on next, never the settled one; an event no wait claims is bridged.
 *   3. Boot rehydration drains a boot-gap inbox across every branch by ARRIVAL order, and the
 *      next iteration's park live-drains the event that was still open.
 *
 * No sleeps: every wake awaits the drive it starts (`emit` → `offer`, the drain → `resume`).
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { assertNone, assertSome } from "@effect/vitest/utils";
import { anyWinner } from "@t3team/sdk";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterAll } from "vite-plus/test";

import { ServerConfig } from "./config.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import {
  WorkflowJournalStore,
  WorkflowJournalStoreLive,
} from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepository, WorkflowRunRepositoryLive } from "./persistence/WorkflowRuns.ts";
import type { WorkflowRun } from "./persistence/WorkflowRuns.ts";
import { WorkflowSignalStore, WorkflowSignalStoreLive } from "./persistence/WorkflowSignalStore.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3team-workflowEngineDurability.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { rehydrateSuspendedWorkflowRuns } from "./t3team-workflowEngineRehydrate.ts";
import {
  makeWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistryLive,
  type T3TeamWorkflowEngineRegistryShape,
} from "./t3team-workflowEngineRegistry.ts";
import {
  makeFakeWorkflowHost,
  makeFakeWorkflowHostLayer,
} from "./t3team-workflowHostFake.fixtures.ts";
import { T3TeamWorkflowSchedulerLive } from "./t3team-workflowScheduler.ts";
import { T3TeamWorkflowSchedulerSweepLive } from "./t3team-workflowSchedulerSweepLive.ts";
import { makeSignalDeliveryPort } from "./t3team-workflowSignalDelivery.ts";
import { tupleOfBranch } from "./t3team-workflowSignalWatchMatch.ts";

// The SDK's own babysitter fixture: one body for the engine tests and this host test.
const workflowPath = NodeURL.fileURLToPath(
  new URL(
    "../../../packages/t3team-sdk/src/__fixtures__/t3team-sdk.signalWaitAny.workflow.ts",
    import.meta.url,
  ),
);
const cwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-wait-any-"));
afterAll(() => NodeFS.rmSync(cwd, { recursive: true, force: true }));

const projectId = ProjectId.make("proj-wait-any");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const nowIso = (): string => "2026-10-07T00:00:00.000Z";
const args = { key: "42" };

const changeRequest = { provider: "github", number: 42, title: "Fix billing", state: "open" };
const checksPayload = { changeRequest, conclusion: "success" };
const closedPayload = { changeRequest: { ...changeRequest, state: "closed" } };
const reviewPayload = { changeRequest, reviewer: "ada", action: "commented" };

// Mirrors the rehydrate test's layer: the durable services, the scheduler rehydration re-arms,
// the fake thread host, and the signal store over the SAME in-memory database.
const TestLayer = T3TeamWorkflowSchedulerSweepLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      T3TeamWorkflowSchedulerLive.pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            T3TeamWorkflowEngineRegistryLive,
            WorkflowRunRepositoryLive,
            WorkflowJournalStoreLive,
          ),
        ),
        Layer.provide(SqlitePersistenceMemory),
      ),
      makeFakeWorkflowHostLayer().layer,
      ServerConfig.layerTest(cwd, { prefix: "t3-wait-any-test-" }),
      WorkflowSignalStoreLive.pipe(Layer.provide(SqlitePersistenceMemory)),
    ),
  ),
  Layer.provideMerge(NodeServices.layer),
);

/** Launch the loop to its first park through `registry`; returns the parked row. */
const launchParked = (runId: string, registry: T3TeamWorkflowEngineRegistryShape) =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const store = yield* WorkflowJournalStore;
    const signalStore = yield* WorkflowSignalStore;
    const config = yield* ServerConfig;
    const shape = {
      runId,
      workflowPath,
      args,
      launchThreadId: `${runId}-launch`,
      projectId,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
    } as const;
    let seq = 0;
    const launched = yield* Effect.promise(() =>
      launchWorkflowRecipe({
        ...shape,
        runsRoot: NodePath.join(config.cwd, ".t3team-runs"),
        registry,
        host: makeFakeWorkflowHost().host,
        newId: () => `id-${(seq += 1)}`,
        nowIso,
        store,
        signalStore,
        lifecycle: makeWorkflowRunLifecycle({
          repo,
          row: buildRunningWorkflowRunRow({ ...shape, nowIso: nowIso() }),
          nowIso,
        }),
      }),
    );
    assert.strictEqual(launched.status, "suspended");
    return Option.getOrThrow(yield* repo.getById({ runId }));
  });

/** The delivery input for branch `index` of `row`'s park. */
const eventOn = (row: WorkflowRun, index: number, payload: unknown) => ({
  ...tupleOfBranch(row.watchAny![index]!),
  payload,
});

/** The run's `signal.waitAny` correlations, in journal order. */
const waitsOf = (runId: string) =>
  Effect.gen(function* () {
    const store = yield* WorkflowJournalStore;
    const { bySeq } = yield* Effect.promise(() => store.readEntries(runId));
    return [...bySeq.values()]
      .filter((entry) => entry.kind === "signal.waitAny")
      .sort((a, b) => a.seq - b.seq)
      .map((entry) => entry.correlationId);
  });

const winnerOf = (runId: string, correlationId: string) =>
  Effect.gen(function* () {
    const store = yield* WorkflowJournalStore;
    return (yield* Effect.promise(() => store.readEntries(runId))).byCorrelation.get(correlationId)
      ?.reply;
  });

it.effect(
  "resumes on a non-first branch, and a losing branch's later event answers the next wait",
  () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const signalStore = yield* WorkflowSignalStore;
      const registry = yield* T3TeamWorkflowEngineRegistry;
      const runId = "wait-any-deliver";

      const first = yield* launchParked(runId, registry);
      assert.strictEqual(first.status, "watching");
      assert.strictEqual(first.pendingKind, "signal.wait");
      assert.deepStrictEqual(
        first.watchAny?.map((branch) => branch.signal),
        [
          "scm.change-request.merged",
          "scm.change-request.closed",
          "scm.change-request.checks.concluded",
          "scm.change-request.review.activity",
        ],
      );
      // Status readers keep seeing a signal park: the single columns name branch 0.
      assert.strictEqual(first.watchSignalName, "scm.change-request.merged");

      const port = makeSignalDeliveryPort({ repo, store: signalStore, registry, nowIso });
      assert.strictEqual(yield* port.emit(eventOn(first, 2, checksPayload)), 1);
      const second = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(second.status, "watching");
      assert.notStrictEqual(second.pendingCorrelationId, first.pendingCorrelationId);
      assert.deepStrictEqual(
        yield* winnerOf(runId, first.pendingCorrelationId!),
        anyWinner(2, checksPayload),
      );

      // The closed branch lost the first wait. Delivered against that stale park (as a racing emit
      // would), it answers the wait the run is on NOW — and the settled wait keeps its winner.
      const stalePort = makeSignalDeliveryPort({
        repo: { ...repo, listByStatus: () => Effect.succeed([first]) },
        store: signalStore,
        registry,
        nowIso,
      });
      assert.strictEqual(yield* stalePort.emit(eventOn(first, 1, closedPayload)), 1);
      assert.deepStrictEqual(
        yield* winnerOf(runId, first.pendingCorrelationId!),
        anyWinner(2, checksPayload),
      );
      assert.deepStrictEqual(
        yield* winnerOf(runId, second.pendingCorrelationId!),
        anyWinner(1, closedPayload),
      );
      const done = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(done.status, "completed");
      assertNone(
        yield* signalStore.takeOpenInboxEntry({
          ...tupleOfBranch(first.watchAny![1]!),
          deliveredAt: nowIso(),
        }),
      );

      // Nothing waits any more: a later event is bridged, never dropped and never resumed.
      assert.strictEqual(yield* port.emit(eventOn(first, 3, reviewPayload)), 0);
      assertSome(
        (yield* signalStore.takeOpenInboxEntry({
          ...tupleOfBranch(first.watchAny![3]!),
          deliveredAt: nowIso(),
        })).pipe(Option.map((entry) => entry.payload)),
        reviewPayload,
      );
    }).pipe(Effect.provide(TestLayer)),
);

it.effect("boot rehydration drains the boot-gap inbox across branches by arrival order", () =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const signalStore = yield* WorkflowSignalStore;
    const runId = "wait-any-rehydrate";

    // Park in a throwaway uptime, then let two events land while the server is "down": the
    // review (branch 3) arrives BEFORE the checks conclusion (branch 2).
    const first = yield* launchParked(runId, makeWorkflowEngineRegistry());
    for (const [index, payload] of [
      [3, reviewPayload],
      [2, checksPayload],
    ] as const) {
      yield* signalStore.insertInboxEntry({
        ...eventOn(first, index, payload),
        createdAt: nowIso(),
      });
    }

    yield* rehydrateSuspendedWorkflowRuns();

    // The drain took the OLDEST entry (review, despite its higher index) for the first wait; the
    // second iteration's park live-drained the checks entry; the third parks with nothing open.
    assert.deepStrictEqual(
      yield* winnerOf(runId, first.pendingCorrelationId!),
      anyWinner(3, reviewPayload),
    );
    const waits = yield* waitsOf(runId);
    assert.strictEqual(waits.length, 3);
    assert.strictEqual(waits[0], first.pendingCorrelationId);
    assert.deepStrictEqual(yield* winnerOf(runId, waits[1]!), anyWinner(2, checksPayload));
    assert.isUndefined(yield* winnerOf(runId, waits[2]!));
    const third = Option.getOrThrow(yield* repo.getById({ runId }));
    assert.strictEqual(third.status, "watching");
    assert.strictEqual(third.pendingCorrelationId, waits[2]);
    assertNone(
      yield* signalStore.takeFirstOpenInboxEntry({
        tuples: first.watchAny!.map(tupleOfBranch),
        deliveredAt: nowIso(),
      }),
    );
  }).pipe(Effect.provide(TestLayer)),
);
