/**
 * The host side of `getConfig()` (G12): the run's project and recipe → its config layers
 * (t3team-recipeConfigLoad.ts) → the values for one repository (t3team-recipeConfigResolve.ts).
 * The answer is journaled by the broker, so a replay reads the same values. The config is named by
 * the recipe's declared id, as `launchThread` scopes are, so a project's copy of a pack recipe
 * reads the same `<id>.config.ts`.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import type { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { loadRecipeConfigLayers } from "./t3team-recipeConfigLoad.ts";
import { recipeIdForPath } from "./t3team-recipeIdentity.ts";
import { resolveRecipeConfigLayers } from "./t3team-recipeConfigResolve.ts";
import { answer, refuse } from "./t3team-workflowHostLaunchShared.ts";
import type { WorkflowHostRecipeConfigInput } from "./t3team-workflowHostPort.ts";

export function makeWorkflowHostConfig(deps: {
  readonly fileSystem: Option.Option<FileSystem.FileSystem>;
  readonly path: Option.Option<Path.Path>;
  readonly projects: Option.Option<ProjectStoreV2["Service"]>;
}) {
  return (input: WorkflowHostRecipeConfigInput) =>
    Effect.gen(function* () {
      if (
        Option.isNone(deps.fileSystem) ||
        Option.isNone(deps.path) ||
        Option.isNone(deps.projects)
      ) {
        return yield* refuse("This host cannot read recipe configs.");
      }
      const project = yield* deps.projects.value.get(input.projectId);
      if (Option.isNone(project)) return yield* refuse(`Project ${input.projectId} not found.`);
      const recipeId = yield* recipeIdForPath(input.recipePath);
      const layers = yield* loadRecipeConfigLayers({
        workspaceRoot: project.value.workspaceRoot,
        recipeId,
        recipePath: input.recipePath,
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, deps.fileSystem.value),
        Effect.provideService(Path.Path, deps.path.value),
      );
      return answer(
        resolveRecipeConfigLayers(layers, {
          repository: input.repository,
          caller: input.caller,
          run: input.run,
        }),
      );
    });
}
