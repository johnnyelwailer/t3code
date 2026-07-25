/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
// @effect-diagnostics nodeBuiltinImport:off - test harness writes a recipe fixture workspace + temp dir.
/**
 * Rehydration of recipe-private workflow scripts (Epic 25 §Scripts + §Open question 2).
 *
 * A recipe-launched run that suspends on `askUser`, survives a restart, and THEN calls
 * `scripts.*` used to fail — rehydration rebuilt the run with an empty scripts tree because
 * the live ScriptRefs are CODE and were never persisted. The run row now persists the
 * launching recipe's directory (`recipe_path`, migration 043) and boot rehydration
 * re-resolves the scripts through the SAME `resolveRecipeWorkflowScripts` path the live
 * launch uses.
 *
 *   1. Round trip: launch (scripts + recipePath) → suspend on askUser → restart (real
 *      `rehydrateSuspendedWorkflowRuns`) → resolve the ask → the post-restart `scripts.*`
 *      call runs and the run completes.
 *   2. Recipe deleted during downtime: rehydration still rebuilds the run (best-effort,
 *      logged), and the resume fails the run — the current clear engine error, not a boot
 *      crash.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
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
import { resolveRecipeWorkflowScripts } from "./t3team-recipeWorkflowScripts.ts";
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
} from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowSchedulerLive } from "./t3team-workflowScheduler.ts";

const fixtureRoot = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../__fixtures__",
);
// The recipe workspace lives under __fixtures__ so the recipe module's `@t3team/sdk` import
// resolves through the package's node_modules (same trick as t3team-recipeWorkflowScripts.test).
const workspaceRoot = NodeFS.mkdtempSync(
  NodePath.join(fixtureRoot, "t3team-rehydrate-scripts-workspace-"),
);
const cwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-rehydrate-scripts-"));
afterAll(() => {
  NodeFS.rmSync(workspaceRoot, { recursive: true, force: true });
  NodeFS.rmSync(cwd, { recursive: true, force: true });
});

/** Write a scripts-bearing recipe whose workflow suspends on askUser BEFORE its script call. */
function writeRecipeFixture(recipeId: string): { recipeRoot: string; workflowPath: string } {
  const recipeRoot = NodePath.join(workspaceRoot, ".t3team", "recipes", recipeId);
  NodeFS.mkdirSync(NodePath.join(recipeRoot, "scripts"), { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(recipeRoot, "scripts", "computeStats.ts"),
    `
import { Schema } from "effect";
import { defineScript } from "@t3team/sdk";

export default defineScript({
  inputs: Schema.Struct({ ratios: Schema.Array(Schema.Number) }),
  outputs: Schema.Struct({ median: Schema.Number }),
  handler: async (args) => {
    const sorted = [...args.ratios].sort((a, b) => a - b);
    return { median: sorted[Math.floor(sorted.length / 2)] ?? 0 };
  },
});
`,
  );
  NodeFS.writeFileSync(
    NodePath.join(recipeRoot, "stats.workflow.ts"),
    `
import { Schema } from "effect";

export const Inputs = Schema.Struct({ ratios: Schema.Array(Schema.Number) });
export const Outputs = Schema.Struct({ median: Schema.Number, approved: Schema.Boolean });

export const meta = {
  name: "${recipeId}.compute",
  description: "Ask the user, then compute stats via a recipe-private script.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["script", "user"],
} as const;

const input = Schema.decodeSync(Inputs)(args);
if (thread === undefined) throw new Error("${recipeId}.compute must run in a launching thread");

const Decision = Schema.Struct({ proceed: Schema.Boolean });
const decision = await thread.askUser("Compute estimate stats?", { schema: Decision });

const stats = await scripts.computeStats({ ratios: input.ratios });
return { median: stats.median, approved: decision.proceed };
`,
  );
  NodeFS.writeFileSync(
    NodePath.join(recipeRoot, "recipe.ts"),
    `
import { defineRecipe, defineWorkflow } from "@t3team/sdk";

import computeStats from "./scripts/computeStats.ts";
import type * as StatsWorkflow from "./stats.workflow.ts";

export default defineRecipe({
  id: "${recipeId}",
  version: "0.1.0",
  title: "Rehydrate stats",
  shortDescription: "Compute estimate-ratio stats deterministically.",
  surfaces: ["workitem.detail.sidepanel"],
  scripts: { computeStats },
  defaultAction: defineWorkflow<typeof StatsWorkflow>("./stats.workflow.ts"),
});
`,
  );
  return { recipeRoot, workflowPath: NodePath.join(recipeRoot, "stats.workflow.ts") };
}

const projectId = ProjectId.make("proj-rehydrate-scripts");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const nowIso = (): string => "2026-07-20T00:00:00.000Z";

const stubEngine: OrchestrationEngineShape = {
  readEvents: () => Stream.empty,
  dispatch: () => Effect.succeed({ sequence: 0 }),
  streamDomainEvents: Stream.never,
  // Required by OrchestrationEngineShape since main's sidebar/turn work; this stub never
  // dispatches, so the latest sequence is simply 0.
  latestSequence: Effect.succeed(0),
};
const OrchestrationEngineTestLive = Layer.succeed(OrchestrationEngineService, stubEngine);

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

const TestLayer = Layer.mergeAll(
  WorkflowEngineDurabilityTestLive,
  OrchestrationEngineTestLive,
  ServerConfig.layerTest(cwd, { prefix: "t3-rehydrate-scripts-test-" }),
).pipe(Layer.provideMerge(NodeServices.layer));

/** Launch the fixture recipe workflow to its askUser suspension, with recipePath persisted. */
const launchToSuspension = (input: {
  readonly runId: string;
  readonly launchThreadId: string;
  readonly recipeRoot: string;
  readonly workflowPath: string;
}) =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const store = yield* WorkflowJournalStore;
    const config = yield* ServerConfig;
    const scripts = yield* resolveRecipeWorkflowScripts({
      recipePath: input.recipeRoot,
      workflowPath: input.workflowPath,
    });
    assert.deepStrictEqual(Object.keys(scripts), ["computeStats"]);

    const throwaway = makeWorkflowEngineRegistry();
    let seq = 0;
    const launched = yield* Effect.promise(() =>
      launchWorkflowRecipe({
        runId: input.runId,
        workflowPath: input.workflowPath,
        args: { ratios: [1, 2, 3] },
        scripts,
        runsRoot: NodePath.join(config.cwd, ".t3team-runs"),
        launchThreadId: input.launchThreadId,
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
            runId: input.runId,
            workflowPath: input.workflowPath,
            args: { ratios: [1, 2, 3] },
            launchThreadId: input.launchThreadId,
            projectId,
            modelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            recipePath: input.recipeRoot,
            nowIso: nowIso(),
          }),
          nowIso,
        }),
      }),
    );
    assert.strictEqual(launched.status, "suspended");

    const suspendedRow = Option.getOrThrow(yield* repo.getById({ runId: input.runId }));
    assert.strictEqual(suspendedRow.status, "suspended");
    assert.strictEqual(suspendedRow.recipePath, input.recipeRoot);
    assert.strictEqual(suspendedRow.pendingKind, "user.input");
    return suspendedRow;
  });

it.effect(
  "re-resolves recipe scripts from the persisted recipe path: a post-restart scripts.* call completes the run",
  () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const { recipeRoot, workflowPath } = writeRecipeFixture("rehydrate-stats");
      const runId = "rehydrate-scripts-roundtrip";
      const launchThreadId = "rehydrate-scripts-thread";

      const suspendedRow = yield* launchToSuspension({
        runId,
        launchThreadId,
        recipeRoot,
        workflowPath,
      });

      // ── Restart: the throwaway registry is gone; the REAL boot rehydration rebuilds. ──
      yield* rehydrateSuspendedWorkflowRuns();

      const registry = yield* T3TeamWorkflowEngineRegistry;
      const userAsk = registry.peekPending(launchThreadId);
      assert.strictEqual(userAsk?.kind, "user.input");
      assert.strictEqual(userAsk?.correlationId, suspendedRow.pendingCorrelationId);

      // Resolving the ask replays past it and hits the POST-restart scripts.* call.
      yield* Effect.promise(() =>
        registry.getRun(runId)!.resume(userAsk!.correlationId, { proceed: true }),
      );

      const finalRow = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(finalRow.status, "completed");
      assert.isUndefined(registry.getRun(runId));
    }).pipe(Effect.provide(TestLayer)),
);

it.effect(
  "recipe deleted during downtime: rehydration still rebuilds, and the resume fails the run cleanly",
  () =>
    Effect.gen(function* () {
      const repo = yield* WorkflowRunRepository;
      const { recipeRoot, workflowPath } = writeRecipeFixture("rehydrate-stats-deleted");
      const runId = "rehydrate-scripts-deleted";
      const launchThreadId = "rehydrate-scripts-deleted-thread";

      const suspendedRow = yield* launchToSuspension({
        runId,
        launchThreadId,
        recipeRoot,
        workflowPath,
      });

      // The workflow file must survive (the engine re-reads it on resume); only the recipe
      // module that re-materializes the scripts disappears.
      NodeFS.rmSync(NodePath.join(recipeRoot, "recipe.ts"));
      NodeFS.rmSync(NodePath.join(recipeRoot, "scripts"), { recursive: true, force: true });

      yield* rehydrateSuspendedWorkflowRuns();

      const registry = yield* T3TeamWorkflowEngineRegistry;
      const userAsk = registry.peekPending(launchThreadId);
      assert.strictEqual(userAsk?.correlationId, suspendedRow.pendingCorrelationId);

      yield* Effect.promise(() =>
        registry.getRun(runId)!.resume(userAsk!.correlationId, { proceed: true }),
      );

      // The scripts.* call fails the run with the existing clear engine error — the failure
      // path, not a rehydration crash.
      const finalRow = Option.getOrThrow(yield* repo.getById({ runId }));
      assert.strictEqual(finalRow.status, "failed");
    }).pipe(Effect.provide(TestLayer)),
);
