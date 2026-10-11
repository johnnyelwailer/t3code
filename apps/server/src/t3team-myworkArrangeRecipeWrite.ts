import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as Effect from "effect/Effect";

import { renderMyWorkArrangeRecipe } from "./t3team-myworkArrangeRecipeTemplate.ts";
import { parseMyWorkArrangeRecipeSpec } from "./t3team-myworkArrangeRecipeSpec.ts";
import { T3TEAM_PROJECT_RECIPES_ROOT } from "./t3team-projectSetupShared.ts";

export type WrittenMyWorkArrangeRecipe = {
  readonly recipeId: string;
  readonly recipePath: string;
  readonly workflowPath: string;
};

/**
 * Write a project-scoped maintain recipe under `.t3team/recipes/<id>/`.
 * The recipe engine has no user-global scope; `digestScope: "all"` is a tool argument inside
 * the workflow, not a second discovery root.
 */
export function writeMyWorkArrangeRecipe(workspaceRoot: string, input: unknown) {
  const parsed = parseMyWorkArrangeRecipeSpec(input);
  if (!parsed.ok) return Effect.fail(parsed.message);
  const spec = parsed.spec;
  return Effect.try({
    try: (): WrittenMyWorkArrangeRecipe => {
      const root = NodePath.resolve(workspaceRoot);
      const dir = NodePath.resolve(root, T3TEAM_PROJECT_RECIPES_ROOT, spec.id);
      const relativeDir = NodePath.relative(root, dir);
      if (relativeDir.startsWith("..") || NodePath.isAbsolute(relativeDir)) {
        throw new Error("Recipe path escapes the workspace.");
      }
      NodeFS.mkdirSync(dir, { recursive: true });
      const rendered = renderMyWorkArrangeRecipe(spec);
      NodeFS.writeFileSync(NodePath.join(dir, "recipe.ts"), rendered.recipeTs);
      NodeFS.writeFileSync(NodePath.join(dir, "workflow.ts"), rendered.workflowTs);
      return {
        recipeId: spec.id,
        recipePath: NodePath.join(T3TEAM_PROJECT_RECIPES_ROOT, spec.id, "recipe.ts"),
        workflowPath: NodePath.join(T3TEAM_PROJECT_RECIPES_ROOT, spec.id, "workflow.ts"),
      };
    },
    catch: (error) => (error instanceof Error ? error.message : String(error)),
  });
}
