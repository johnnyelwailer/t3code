/**
 * `t3team.recipe.launchHeadless` — launch a discovered recipe's workflow WITHOUT a thread
 * (S5b). Pack views call it through pack-ui's `launchRecipe`; the trigger runner drives the same
 * service headless (origin `"trigger"`).
 *
 * The request names a project + recipe id and, optionally, one of the recipe's named actions.
 * The server resolves the recipe through the unfiltered library enumeration (pack and
 * project-local, same precedence as `t3team.recipe.list`) — a caller cannot steer a launch at a
 * path it picked. The project's default model selection is the model: headless has no thread to
 * inherit one from.
 */
import { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/http";

import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import { launchHeadlessRecipeWorkflow } from "./t3team-recipeHeadlessLaunch.ts";
import { listProjectRecipesForAgent } from "./t3team-recipeAgentList.ts";
import { resolveRecipeHostToolScope } from "./t3team-recipeWorkflowToolScope.ts";

/** The RPC body: a pack view launching a recipe from a surface (no thread involved). */
export interface RecipeHeadlessLaunchRequest {
  readonly projectId?: string;
  readonly recipeId?: string;
  /** One of the recipe's named actions; absent runs `defaultAction`. */
  readonly action?: string;
  readonly args?: Record<string, unknown>;
  /** Where the launch was called from; opaque to the host (a surface's own identifiers). */
  readonly surfaceContext?: Record<string, unknown>;
}

export const t3teamRecipeHeadlessLaunchRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/recipe/launch-headless",
  Effect.gen(function* () {
    const input = yield* readJsonBody<RecipeHeadlessLaunchRequest>();
    const projectId = input.projectId?.trim() ?? "";
    const recipeId = input.recipeId?.trim() ?? "";
    if (projectId.length === 0 || recipeId.length === 0) {
      return yield* new T3TeamAtlassianError({
        message: "projectId and recipeId are required.",
      });
    }
    const store = yield* ProjectStoreV2;
    const project = yield* store
      .get(ProjectId.make(projectId))
      .pipe(
        Effect.mapError(
          (cause) => new T3TeamAtlassianError({ message: String(cause.message ?? cause) }),
        ),
      );
    if (project._tag === "None") {
      return yield* new T3TeamAtlassianError({ message: `Unknown project: '${projectId}'.` });
    }
    const row = project.value;
    if (row.defaultModelSelection === null) {
      return yield* new T3TeamAtlassianError({
        message:
          "This project has no default model selection, so a headless recipe launch has no model to run on.",
      });
    }

    // Unfiltered library (pack + project-local, one precedence) — the same enumeration the
    // agent-facing list uses, so a caller cannot address a path the recipe does not own.
    const library = yield* listProjectRecipesForAgent({ workspaceRoot: row.workspaceRoot });
    const entry = library.recipes.find((candidate) => candidate.id === recipeId);
    if (entry === undefined) {
      return yield* new T3TeamAtlassianError({
        message: `Recipe '${recipeId}' was not found in this project (pack or .t3team/recipes).`,
      });
    }
    const actionName = input.action?.trim() ?? "";
    const workflowPath =
      actionName.length === 0 || actionName === "default"
        ? entry.workflowPath
        : entry.actions?.find((action) => action.name === actionName)?.workflowPath;
    if (workflowPath === undefined || workflowPath.trim().length === 0) {
      return yield* new T3TeamAtlassianError({
        message:
          actionName.length === 0
            ? "This recipe has no .workflow.ts to run headless."
            : `Action '${actionName}' of recipe '${recipeId}' has no resolvable .workflow.ts.`,
      });
    }

    // The recipe's OWN declared tool groups (fail-closed, like the thread-bound launch): they
    // are the only grant the headless run's scripts hold. No host tools — no thread to bind to.
    const scope = yield* resolveRecipeHostToolScope({
      recipePath: entry.recipePath,
      workflowPath,
    });
    const allowedToolGroups = scope.kind === "granted" ? scope.toolGroups : [];

    const result = yield* launchHeadlessRecipeWorkflow({
      projectId: row.projectId,
      workspaceRoot: row.workspaceRoot,
      recipePath: entry.recipePath,
      workflowPath,
      recipe: {
        id: entry.id,
        ...(actionName.length === 0 ? {} : { action: actionName }),
      },
      args: input.args ?? {},
      modelSelection: row.defaultModelSelection,
      allowedToolGroups,
      origin: "recipe",
    });
    return okJson({ ok: true, mode: "engine", runId: result.runId, status: result.status });
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to launch the headless recipe.")),
    Effect.catch(errorResponse),
  ),
);
