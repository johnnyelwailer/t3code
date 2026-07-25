import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";
import type {
  DeleteManagedProjectRecipeRequest,
  UpdateManagedProjectRecipeRequest,
} from "@t3tools/project-recipes";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { listManagedProjectRecipes } from "./t3team-projectRecipeManagementRead.ts";
import {
  deleteManagedProjectRecipe,
  updateManagedProjectRecipe,
} from "./t3team-projectRecipeManagementMutations.ts";
import { normalizeT3TeamWorkspaceRoot, toT3TeamError } from "./t3team-project-repository-utils.ts";

function requireWorkspaceRoot(input: { readonly workspaceRoot?: string }) {
  const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
  return workspaceRootInput.length > 0
    ? normalizeT3TeamWorkspaceRoot(workspaceRootInput)
    : new T3TeamAtlassianError({ message: "workspaceRoot is required." });
}

export const t3teamProjectWorkspaceListManagedRecipesRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/project/workspace/recipes/manage/list",
  Effect.gen(function* () {
    const input = yield* readJsonBody<{ readonly workspaceRoot?: string }>();
    const workspaceRoot = yield* requireWorkspaceRoot(input);
    return okJson(yield* listManagedProjectRecipes(workspaceRoot));
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to list project recipes.")),
    Effect.catch(errorResponse),
  ),
);

export const t3teamProjectWorkspaceUpdateManagedRecipeRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/project/workspace/recipes/manage/update",
  Effect.gen(function* () {
    const input = yield* readJsonBody<UpdateManagedProjectRecipeRequest>();
    const workspaceRoot = yield* requireWorkspaceRoot(input);
    if (!input.recipePath) {
      return yield* new T3TeamAtlassianError({ message: "recipePath is required." });
    }
    return okJson(yield* updateManagedProjectRecipe({ ...input, workspaceRoot }));
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to update project recipe.")),
    Effect.catch(errorResponse),
  ),
);

export const t3teamProjectWorkspaceDeleteManagedRecipeRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/project/workspace/recipes/manage/delete",
  Effect.gen(function* () {
    const input = yield* readJsonBody<DeleteManagedProjectRecipeRequest>();
    const workspaceRoot = yield* requireWorkspaceRoot(input);
    if (!input.recipePath) {
      return yield* new T3TeamAtlassianError({ message: "recipePath is required." });
    }
    return okJson(
      yield* deleteManagedProjectRecipe({ workspaceRoot, recipePath: input.recipePath }),
    );
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to delete project recipe.")),
    Effect.catch(errorResponse),
  ),
);
