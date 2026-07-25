/**
 * Whether a PACK-shipped path may be executed by `t3team.orchestration.run`.
 *
 * Directory containment answers the wrong question — "is this file somewhere under a pack's recipe
 * root" — which would make every `.ts` a pack happens to ship runnable
 * (`internal/migration.workflow.ts`, `test-fixtures/destructive.workflow.ts`, …). Authorization is
 * therefore bound to recipe IDENTITY: the path must BE the declared `workflowPath` of a recipe that
 * discovery currently surfaces and that no higher-precedence source shadows, taken from the same
 * discovery + precedence merge `t3team.recipe.list` uses and compared on canonical paths.
 *
 * Read-only surfaces (`t3team.recipe.list`, `t3team.recipe.validate`) deliberately keep the broader
 * directory containment of `resolveAgentRecipePath`: reading or statically analysing a file inside
 * an installed pack is not a privilege, and the agent must be able to inspect recipes that fail to
 * load. Only EXECUTION requires identity.
 */
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as FileSystemService from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as PathService from "effect/Path";

import { canonicalizePath } from "@t3team/packs";

import { listProjectRecipesForAgent } from "./t3team-recipeAgentList.ts";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const CONTAINMENT_HINT =
  "Paths must stay inside the project workspace root, or be the declared workflow of a discovered pack recipe.";

/**
 * Pack scopes whose recipes may be EXECUTED. Epic 16 §Scope requires signing plus policy locks
 * before remote-managed pack content is trusted, and neither exists yet, so `remote-managed` is
 * excluded from execution while remaining fully listable and validatable.
 */
export const EXECUTABLE_PACK_SCOPES: ReadonlySet<string> = new Set([
  "distribution",
  "global",
  "user",
  "project",
]);

/**
 * Every workflow one listed recipe declares: its default `workflowPath` PLUS each named action's
 * workflow (Epic 16 §Plugin Modules — one recipe, several actions). Actions extend the allow-list by
 * NAMED ENTRY only; a `.workflow.ts` the recipe does not declare as an action stays unrunnable even
 * though it sits in the same directory.
 */
const declaredWorkflowPaths = (recipe: {
  readonly workflowPath?: string | undefined;
  readonly actions?: ReadonlyArray<{ readonly workflowPath: string }> | undefined;
}): ReadonlyArray<string> => [
  ...(typeof recipe.workflowPath === "string" ? [recipe.workflowPath] : []),
  ...(recipe.actions ?? []).map((action) => action.workflowPath),
];

/** Declared workflow paths of every discovered, unshadowed, locally-installed pack recipe. */
const executablePackWorkflowPaths = (input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
}): Effect.Effect<ReadonlySet<string>, string> =>
  listProjectRecipesForAgent({ workspaceRoot: input.workspaceRoot })
    .pipe(
      Effect.provideService(FileSystemService.FileSystem, input.fileSystem),
      Effect.provideService(PathService.Path, input.path),
      Effect.mapError(errorMessage),
    )
    .pipe(
      Effect.map(
        (listed) =>
          new Set(
            listed.recipes
              .filter(
                (recipe) =>
                  recipe.source === "pack" && EXECUTABLE_PACK_SCOPES.has(recipe.packScope ?? ""),
              )
              .flatMap((recipe) => declaredWorkflowPaths(recipe).map(canonicalizePath)),
          ),
      ),
    );

/** Existence plus a re-proof of the authorization, as late as possible before the engine opens it. */
export const confirmRunnable = (input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly resolved: string;
  readonly reauthorize: () => Effect.Effect<boolean, string>;
}): Effect.Effect<string, string> =>
  input.fileSystem.exists(input.resolved).pipe(
    Effect.mapError(errorMessage),
    Effect.flatMap((exists) =>
      exists ? input.reauthorize() : Effect.fail(`Workflow path does not exist: ${input.resolved}`),
    ),
    Effect.flatMap((authorized) =>
      authorized
        ? Effect.succeed(input.resolved)
        : Effect.fail(
            `Path '${input.resolved}' is not runnable from this project. ${CONTAINMENT_HINT}`,
          ),
    ),
  );

/**
 * Authorize a path that is NOT workspace-local. It runs only if it is a discovered pack recipe's
 * declared workflow; otherwise the original containment failure stands. The membership test is
 * repeated after the existence probe, so a symlink swapped in between acceptance and launch loses.
 */
export const authorizePackWorkflow = (input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly requestedPath: string;
  readonly containmentError: string;
}): Effect.Effect<string, string> => {
  const { fileSystem, path, workspaceRoot, requestedPath } = input;
  const declared = () => executablePackWorkflowPaths({ fileSystem, path, workspaceRoot });
  const resolved = path.resolve(workspaceRoot, requestedPath);
  return declared().pipe(
    Effect.flatMap((paths) =>
      paths.has(canonicalizePath(resolved))
        ? confirmRunnable({
            fileSystem,
            resolved,
            reauthorize: () =>
              declared().pipe(Effect.map((again) => again.has(canonicalizePath(resolved)))),
          })
        : Effect.fail(input.containmentError),
    ),
  );
};
