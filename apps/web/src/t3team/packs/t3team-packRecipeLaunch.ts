/**
 * Host-side `launchRecipe` for pack views (S5b): start a discovered recipe's workflow with NO
 * thread, from a surface that knows its own project. The backend call is the
 * `t3team.recipe.launchHeadless` RPC; the host resolves the project, the recipe (through the
 * project's unfiltered library) and the project's default model selection — the pack only names
 * the recipe, an optional action, and the args.
 *
 * The backend instance is installed at boot (the same seam as `setPackDocumentSource`): pack
 * views call `launchRecipe` from event handlers, where React hooks are not available.
 */
import type { PackRecipeLaunchInput, PackRecipeLaunchResult } from "@t3team/pack-ui/contract";

import type { BackendApi } from "~/t3team/backend/t3team-types";

let installedBackend: BackendApi | null = null;

/** Install the app's backend once, at boot (the t3team route surface does this). */
export function setPackRecipeLaunchBackend(backend: BackendApi | null): void {
  installedBackend = backend;
}

export function launchRecipe(input: PackRecipeLaunchInput): Promise<PackRecipeLaunchResult> {
  const backend = installedBackend;
  if (backend === null || typeof backend.launchRecipeHeadless !== "function") {
    return Promise.reject(
      new Error(
        "launchRecipe: no T3 backend with headless recipe launch is connected on this surface.",
      ),
    );
  }
  const projectId =
    typeof input.surfaceContext?.projectId === "string" ? input.surfaceContext.projectId : "";
  if (projectId.length === 0) {
    return Promise.reject(
      new Error(
        "launchRecipe: the surface did not pass its projectId in surfaceContext — a headless launch needs a project to run in.",
      ),
    );
  }
  return backend.launchRecipeHeadless({
    projectId,
    recipeId: input.recipeId,
    ...(input.action === undefined ? {} : { action: input.action }),
    ...(input.args === undefined ? {} : { args: input.args }),
    ...(input.surfaceContext === undefined ? {} : { surfaceContext: input.surfaceContext }),
  });
}
