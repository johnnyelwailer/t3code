import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";
import type { DiscoverProjectRecipesRequest } from "@t3tools/project-recipes";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { discoverProjectRecipes } from "./t3team-projectRecipeDiscovery.ts";
import { normalizeT3TeamWorkspaceRoot, toT3TeamError } from "./t3team-project-repository-utils.ts";

export const t3teamProjectWorkspaceDiscoverRecipesRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/project/workspace/recipes/discover",
  Effect.gen(function* () {
    const input = yield* readJsonBody<DiscoverProjectRecipesRequest>();
    const workspaceRootInput = input.workspaceRoot?.trim() ?? "";
    if (workspaceRootInput.length === 0) {
      return yield* new T3TeamAtlassianError({ message: "workspaceRoot is required." });
    }
    if (!input.context || typeof input.context !== "object") {
      return yield* new T3TeamAtlassianError({ message: "context is required." });
    }

    const workspaceRoot = yield* normalizeT3TeamWorkspaceRoot(workspaceRootInput);
    const response = yield* discoverProjectRecipes({
      workspaceRoot,
      context: input.context,
    });
    return okJson(response);
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to discover project recipes.")),
    Effect.catch(errorResponse),
  ),
);
