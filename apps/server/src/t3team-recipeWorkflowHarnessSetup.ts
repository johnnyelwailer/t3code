// @effect-diagnostics nodeBuiltinImport:off - the harness materializes temp run roots on disk.
/**
 * Fixture/workspace preparation for the recipe E2E harness (Epic 25 §Host wiring).
 *
 * Owns everything that must exist before a launch: the temp workspace + runs roots, the seeded
 * fixture project on disk, the harness run identity, and the real `project.create`/`thread.create`
 * dispatches the launch thread hangs off.
 */
import { CommandId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { seedT3TeamFixtureProject } from "./t3team-fixtureProjectSeed.ts";
import { loadT3TeamRecipeHarnessRecipe } from "./t3team-recipeWorkflowHarnessRecipe.ts";

/** Frozen timestamp for every harness-authored record, so reports diff cleanly. */
export const T3TEAM_HARNESS_ISO = "2026-07-20T08:00:00.000Z";

export function prepareT3TeamRecipeHarnessProject(input: {
  /** Directory holding the recipe module (`recipe.ts`) and its `workflow.ts`. */
  readonly recipeDir: string;
  /** Fixture directory ingested into the harness workspace before the launch. */
  readonly fixtureRoot: string;
}) {
  return Effect.gen(function* () {
    const orchestration = yield* OrchestrationEngineService;
    const recipe = yield* Effect.promise(() => loadT3TeamRecipeHarnessRecipe(input.recipeDir));

    const workspaceRoot = NodeFS.mkdtempSync(
      NodePath.join(NodeOS.tmpdir(), "t3team-recipe-e2e-ws-"),
    );
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-recipe-e2e-runs-"));
    const seeded = yield* seedT3TeamFixtureProject({
      fixtureRoot: input.fixtureRoot,
      workspaceRoot,
    });

    const projectId = ProjectId.make(`harness-${recipe.id}`);
    const modelSelection = createModelSelection(
      ProviderInstanceId.make("harness-instance"),
      "harness-model",
    );
    const launchThreadId = `harness-launch-${recipe.id}`;
    // Unique per invocation: a deterministic runId let a later run REPLAY the previous
    // run's journal, so the second spawnThread resolved to the earlier run's thread and the
    // engine rejected a second turn on it. The run identity is the harness's to own.
    const runId = `harness-run-${recipe.id}-${(yield* Clock.currentTimeMillis).toString(36)}`;

    // Let the reactor + stub subscribe to the hot domain-event stream before anything dispatches.
    yield* Effect.sleep(Duration.millis(100));
    yield* orchestration.dispatch({
      type: "project.create",
      commandId: CommandId.make(`${runId}-project`),
      projectId,
      title: `Harness ${recipe.id}`,
      workspaceRoot,
      defaultModelSelection: modelSelection,
      createdAt: T3TEAM_HARNESS_ISO,
    });
    yield* orchestration.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`${runId}-thread`),
      threadId: ThreadId.make(launchThreadId),
      projectId,
      title: "Harness launch thread",
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: T3TEAM_HARNESS_ISO,
    });

    return {
      recipe,
      workspaceRoot,
      runsRoot,
      seeded,
      projectId,
      modelSelection,
      launchThreadId,
      runId,
    };
  });
}

/** Drop the temp roots the harness materialized once the report is assembled. */
export function cleanupT3TeamRecipeHarnessRoots(roots: {
  readonly workspaceRoot: string;
  readonly runsRoot: string;
}): void {
  NodeFS.rmSync(roots.workspaceRoot, { recursive: true, force: true });
  NodeFS.rmSync(roots.runsRoot, { recursive: true, force: true });
}
