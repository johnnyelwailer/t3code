/**
 * The `migrate-project-state` recipe, shipped with the core: the runbook a main-repository switch
 * hands a large state-dir migration to. Like `describe-rewrite`, it reaches a workspace through
 * project-setup scaffolding and is found by the shared project-local discovery, so a launch
 * resolves it by id like any other recipe. It has no surfaces: only the switch launches it.
 *
 * Its workflow and outcome script are authored as real modules (typechecked) and embedded as text.
 *
 * @module t3team-projectSetupStateMigrationRecipe
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { resolveModuleSourceText } from "./t3team-moduleSourceText.ts";
import {
  T3TEAM_PROJECT_RECIPES_ROOT,
  type T3TeamProjectSetupFile,
} from "./t3team-projectSetupShared.ts";
import rawScript from "./t3team-stateMigrationRecordOutcome.script.ts?raw";
import rawWorkflow from "./t3team-stateMigration.workflow.ts?raw";

export const STATE_MIGRATION_RECIPE_ID = "migrate-project-state";

/** Kept in consts so bundlers do not mistake them for static asset references to rewrite. */
const WORKFLOW_FILE = "./t3team-stateMigration.workflow.ts";
const SCRIPT_FILE = "./t3team-stateMigrationRecordOutcome.script.ts";

const STATE_MIGRATION_WORKFLOW_BODY = resolveModuleSourceText({
  inlined: rawWorkflow,
  fileUrl: new URL(WORKFLOW_FILE, import.meta.url),
  marker: "export const meta",
  label: "migrate-project-state workflow body",
});

const STATE_MIGRATION_RECORD_OUTCOME_SCRIPT = resolveModuleSourceText({
  inlined: rawScript,
  fileUrl: new URL(SCRIPT_FILE, import.meta.url),
  marker: "export default defineScript(",
  label: "migrate-project-state recordOutcome script",
});

const RECIPE_MODULE = `import { defineRecipe, defineWorkflow } from "@t3team/sdk";

import recordOutcome from "./scripts/recordOutcome.ts";
import type * as Workflow from "./workflow.ts";

export default defineRecipe({
  id: ${JSON.stringify(STATE_MIGRATION_RECIPE_ID)},
  version: "0.1.0",
  scope: "project",
  title: "Migrate project state",
  shortDescription:
    "Copy the project state into a new main repository: target wins, reference clones and child worktrees stay put.",
  surfaces: [],
  allowedToolGroups: [],
  scripts: { recordOutcome },
  defaultAction: defineWorkflow<typeof Workflow>("./workflow.ts"),
});
`;

export function stateMigrationRecipeSetupFiles(): ReadonlyArray<T3TeamProjectSetupFile> {
  const root = `${T3TEAM_PROJECT_RECIPES_ROOT}/${STATE_MIGRATION_RECIPE_ID}`;
  return [
    { relativePath: `${root}/recipe.ts`, contents: RECIPE_MODULE, writeMode: "if-missing" },
    {
      relativePath: `${root}/workflow.ts`,
      contents: STATE_MIGRATION_WORKFLOW_BODY,
      writeMode: "if-missing",
    },
    {
      relativePath: `${root}/scripts/recordOutcome.ts`,
      contents: STATE_MIGRATION_RECORD_OUTCOME_SCRIPT,
      writeMode: "if-missing",
    },
  ];
}

/** Scaffolds the recipe into `workspaceRoot` where project setup has not yet (if-missing). */
export const ensureStateMigrationRecipe = Effect.fn("ensureStateMigrationRecipe")(function* (
  workspaceRoot: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const file of stateMigrationRecipeSetupFiles()) {
    const target = path.join(workspaceRoot, file.relativePath);
    if (yield* fileSystem.exists(target)) continue;
    yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true });
    yield* fileSystem.writeFileString(target, file.contents);
  }
});
