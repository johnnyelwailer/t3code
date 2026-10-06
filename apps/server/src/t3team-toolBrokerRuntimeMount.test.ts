import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { vi } from "vite-plus/test";

import { GitWorkflowService } from "./git/GitWorkflowService.ts";
import { SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { WorkflowJournalStoreLive } from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepositoryLive } from "./persistence/WorkflowRuns.ts";
import { mountT3TeamBrokerBeforeRuntimeServices } from "./server.ts";
import { makeWorkflowRunToolsForThread } from "./t3team-toolBrokerWorkflowRunLive.ts";
import { T3TeamWorkflowEngineRegistryLive } from "./t3team-workflowEngineRegistry.ts";
import { makeFakeWorkflowHostLayer } from "./t3team-workflowHostFake.fixtures.ts";
import { T3TeamWorkflowSchedulerLive } from "./t3team-workflowScheduler.ts";

it.effect("exposes the own-worktree Git service while the production broker layer is built", () => {
  const createWorktree = vi.fn(() =>
    Effect.succeed({
      worktree: { refName: "feature/child", path: "/workspace/child" },
    }),
  );
  const gitWorkflowLayer = Layer.succeed(GitWorkflowService, {
    createWorktree,
  } as unknown as GitWorkflowService["Service"]);
  const brokerConstructionProbe = Layer.effectDiscard(
    Effect.gen(function* () {
      const workflow = Option.getOrUndefined(yield* Effect.serviceOption(GitWorkflowService));
      assert.isDefined(workflow);
      yield* workflow.createWorktree({
        cwd: "/workspace/project",
        refName: "main",
        newRefName: "feature/child",
        baseRefName: "main",
        path: "/workspace/child",
      });
    }),
  );
  const productionOrderedLayer = mountT3TeamBrokerBeforeRuntimeServices(
    Layer.empty,
    brokerConstructionProbe,
  ).pipe(Layer.provideMerge(gitWorkflowLayer));

  return Layer.build(productionOrderedLayer).pipe(
    Effect.scoped,
    Effect.andThen(() => Effect.sync(() => assert.equal(createWorktree.mock.calls.length, 1))),
  );
});

// The V2 orchestration tools (`t3team.orchestration.*`) are enabled only when the broker's own
// layer env holds the durable-engine services AND the workflow host. The broker mounts beneath
// the runtime head, so a host registered only in the head never reaches it.
const engineLayer = Layer.mergeAll(
  T3TeamWorkflowEngineRegistryLive,
  WorkflowRunRepositoryLive,
  WorkflowJournalStoreLive,
).pipe(Layer.provideMerge(T3TeamWorkflowSchedulerLive), Layer.provide(SqlitePersistenceMemory));

const orchestrationToolsEnabled = (hostIn: "broker" | "runtime-head") => {
  const hostLayer = makeFakeWorkflowHostLayer().layer;
  let enabled: boolean | undefined;
  const brokerProbe = Layer.effectDiscard(
    makeWorkflowRunToolsForThread({
      loadThreadProject: () => Effect.fail("no project"),
    }).pipe(
      Effect.tap((tools) =>
        Effect.sync(() => {
          enabled = tools !== undefined;
        }),
      ),
    ),
  ).pipe(Layer.provide(hostIn === "broker" ? hostLayer : Layer.empty));
  const productionOrderedLayer = mountT3TeamBrokerBeforeRuntimeServices(
    hostIn === "runtime-head" ? hostLayer : Layer.empty,
    brokerProbe,
  ).pipe(Layer.provideMerge(engineLayer));
  return Layer.build(productionOrderedLayer).pipe(
    Effect.scoped,
    Effect.map(() => enabled),
  );
};

it.effect("enables the orchestration tools when the host is provided to the broker", () =>
  orchestrationToolsEnabled("broker").pipe(Effect.map((enabled) => assert.isTrue(enabled))),
);

it.effect(
  "leaves the orchestration tools disabled when the host sits only in the runtime head",
  () =>
    orchestrationToolsEnabled("runtime-head").pipe(
      Effect.map((enabled) => assert.isFalse(enabled)),
    ),
);
