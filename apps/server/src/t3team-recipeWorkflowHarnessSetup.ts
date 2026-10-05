// @effect-diagnostics nodeBuiltinImport:off - the harness materializes temp run roots on disk.
/**
 * Fixture/workspace preparation for the recipe E2E harness (Epic 25 §Host wiring).
 *
 * Owns everything that must exist before a launch: the temp workspace + runs roots, the seeded
 * fixture project on disk, the harness run identity, and the project + launch thread the run
 * hangs off (registered on the real V2 runtime).
 */
import { ProjectId } from "@t3tools/contracts";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { seedT3TeamFixtureProject } from "./t3team-fixtureProjectSeed.ts";
import { loadT3TeamRecipeHarnessRecipe } from "./t3team-recipeWorkflowHarnessRecipe.ts";
import { WORKFLOW_STUB_MODEL_SELECTION } from "./t3team-workflowStubAgentTurn.ts";
import { createWorkflowStubThread, seedWorkflowStubProject } from "./t3team-workflowStubRuntime.ts";

/** Frozen timestamp for every harness-authored record, so reports diff cleanly. */
export const T3TEAM_HARNESS_ISO = "2026-07-20T08:00:00.000Z";

export function prepareT3TeamRecipeHarnessProject(input: {
  /** Directory holding the recipe module (`recipe.ts`) and its `workflow.ts`. */
  readonly recipeDir: string;
  /** Fixture directory ingested into the harness workspace before the launch. */
  readonly fixtureRoot: string;
}) {
  return Effect.gen(function* () {
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
    const modelSelection = WORKFLOW_STUB_MODEL_SELECTION;
    const launchThreadId = `harness-launch-${recipe.id}`;
    // Unique per invocation: a deterministic runId let a later run REPLAY the previous
    // run's journal, so the second spawnThread resolved to the earlier run's thread and the
    // engine rejected a second turn on it. The run identity is the harness's to own.
    const runId = `harness-run-${recipe.id}-${(yield* Clock.currentTimeMillis).toString(36)}`;

    yield* seedWorkflowStubProject({ projectId, workspaceRoot });
    yield* createWorkflowStubThread({
      threadId: launchThreadId,
      projectId,
      title: "Harness launch thread",
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
