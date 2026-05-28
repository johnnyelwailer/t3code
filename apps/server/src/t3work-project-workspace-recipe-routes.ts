import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";
import type { DiscoverProjectRecipesRequest } from "@t3tools/project-recipes";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3workAtlassianError,
} from "./t3work-atlassian-http.ts";
import { discoverProjectRecipes } from "./t3work-projectRecipeDiscovery.ts";
import { normalizeT3workWorkspaceRoot, toT3workError } from "./t3work-project-repository-utils.ts";

export const t3workProjectWorkspaceDiscoverRecipesRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/project/workspace/recipes/discover",
  Effect.gen(function* () {
    const input = yield* readJsonBody<DiscoverProjectRecipesRequest>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    if (workspaceRootInput.length === 0) {
      return yield* new T3workAtlassianError({ message: "workspaceRoot is required." });
    }
    if (!input.context || typeof input.context !== "object") {
      return yield* new T3workAtlassianError({ message: "context is required." });
    }

    const workspaceRoot = yield* normalizeT3workWorkspaceRoot(workspaceRootInput);
    const response = yield* discoverProjectRecipes({
      workspaceRoot,
      context: input.context,
    });
    return okJson(response);
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to discover project recipes.")),
    Effect.catch(errorResponse),
  ),
);
