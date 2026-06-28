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
  T3workAtlassianError,
} from "./t3work-atlassian-http.ts";
import { listManagedProjectRecipes } from "./t3work-projectRecipeManagementRead.ts";
import {
  deleteManagedProjectRecipe,
  updateManagedProjectRecipe,
} from "./t3work-projectRecipeManagementMutations.ts";
import { normalizeT3workWorkspaceRoot, toT3workError } from "./t3work-project-repository-utils.ts";

function requireWorkspaceRoot(input: { readonly workspaceRoot?: string }) {
  const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
  return workspaceRootInput.length > 0
    ? normalizeT3workWorkspaceRoot(workspaceRootInput)
    : new T3workAtlassianError({ message: "workspaceRoot is required." });
}

export const t3workProjectWorkspaceListManagedRecipesRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/project/workspace/recipes/manage/list",
  Effect.gen(function* () {
    const input = yield* readJsonBody<{ readonly workspaceRoot?: string }>();
    const workspaceRoot = yield* requireWorkspaceRoot(input);
    return okJson(yield* listManagedProjectRecipes(workspaceRoot));
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to list project recipes.")),
    Effect.catch(errorResponse),
  ),
);

export const t3workProjectWorkspaceUpdateManagedRecipeRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/project/workspace/recipes/manage/update",
  Effect.gen(function* () {
    const input = yield* readJsonBody<UpdateManagedProjectRecipeRequest>();
    const workspaceRoot = yield* requireWorkspaceRoot(input);
    if (!input.recipePath) {
      return yield* new T3workAtlassianError({ message: "recipePath is required." });
    }
    return okJson(yield* updateManagedProjectRecipe({ ...input, workspaceRoot }));
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to update project recipe.")),
    Effect.catch(errorResponse),
  ),
);

export const t3workProjectWorkspaceDeleteManagedRecipeRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/project/workspace/recipes/manage/delete",
  Effect.gen(function* () {
    const input = yield* readJsonBody<DeleteManagedProjectRecipeRequest>();
    const workspaceRoot = yield* requireWorkspaceRoot(input);
    if (!input.recipePath) {
      return yield* new T3workAtlassianError({ message: "recipePath is required." });
    }
    return okJson(
      yield* deleteManagedProjectRecipe({ workspaceRoot, recipePath: input.recipePath }),
    );
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to delete project recipe.")),
    Effect.catch(errorResponse),
  ),
);
