/**
 * Path containment for the agent-facing read-only recipe tools.
 *
 * `t3team.recipe.list` hands the agent an absolute `recipePath`, and for a pack-shipped recipe that
 * path is INSIDE THE PACK, not inside the project workspace. Validating only against the workspace
 * root therefore rejected exactly the paths the list told the agent to use, making
 * `t3team.recipe.validate` unusable on the shipped library.
 *
 * Containment is still mandatory — it is what keeps `../../etc/passwd` out — so the allowed roots
 * are the project workspace plus the recipe roots of currently-active packs, and nothing else. Pack
 * recipe roots come from the same registry discovery uses, so a path is accepted only if some pack
 * actually contributes that recipe directory right now. `resolveWithinRoot` compares CANONICAL
 * paths, so a symlinked recipe directory cannot smuggle a target out of its root.
 *
 * READ-ONLY SURFACES ONLY. Directory containment is deliberately NOT execution authorization:
 * being somewhere under a pack's recipe root would make every `.ts` the pack ships runnable. The
 * run path therefore binds to recipe IDENTITY instead — see
 * {@link ./t3team-workflowRunPathAuthorize.ts}. The asymmetry is intentional: listing and
 * statically validating a file inside an installed pack is not a privilege; executing it is.
 */
import type * as Path from "effect/Path";

import { getPackRecipeSources } from "./t3team-packRecipeSources.ts";
import { resolveWithinRoot } from "./t3team-projectRecipeDiscoveryShared.ts";

/**
 * Resolve an agent-supplied recipe/workflow path against the project workspace, falling back to
 * the active pack recipe roots. Throws the workspace-root error when no root contains the path, so
 * the common (project-local) failure keeps its original message.
 */
export function resolveAgentRecipePath(
  pathService: Path.Path,
  workspaceRoot: string,
  requestedPath: string,
): string {
  try {
    return resolveWithinRoot(pathService, workspaceRoot, requestedPath);
  } catch (workspaceError) {
    for (const source of getPackRecipeSources().sources) {
      try {
        return resolveWithinRoot(pathService, source.recipeRoot, requestedPath);
      } catch {
        // Not this pack's recipe; keep looking.
      }
    }
    throw workspaceError;
  }
}
