// @effect-diagnostics nodeBuiltinImport:off - the harness resolves a recipe module by path.
import type { AnyScriptRef } from "@t3work/sdk";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

export type T3workRecipeHarnessRecipe = {
  readonly id: string;
  readonly workflowPath: string;
  /** The recipe's private scripts, as `launchWorkflowRecipe` expects them. */
  readonly scripts: Readonly<Record<string, AnyScriptRef>>;
  readonly scriptNames: ReadonlyArray<string>;
};

function resolveWorkflowPath(recipeDir: string, action: unknown): string {
  const record = (action ?? {}) as Record<string, unknown>;
  const relative =
    typeof record.workflowPath === "string"
      ? record.workflowPath
      : typeof record.path === "string"
        ? record.path
        : "./workflow.ts";
  const resolved = NodePath.resolve(recipeDir, relative);
  if (!NodeFS.existsSync(resolved)) {
    throw new Error(`Recipe workflow not found: ${resolved}`);
  }
  return resolved;
}

/**
 * Load a `defineRecipe(...)` module and hand back what the launch path needs. The recipe's own
 * `scripts` map is passed through, which is what lets the harness exercise `scripts.*` handlers
 * for real instead of relying on the server route (which still launches with `scripts: {}`).
 */
export async function loadT3workRecipeHarnessRecipe(
  recipeDir: string,
): Promise<T3workRecipeHarnessRecipe> {
  const absoluteDir = NodePath.resolve(recipeDir);
  const modulePath = NodePath.join(absoluteDir, "recipe.ts");
  if (!NodeFS.existsSync(modulePath)) {
    throw new Error(`Recipe module not found: ${modulePath}`);
  }
  const imported = (await import(NodeURL.pathToFileURL(modulePath).href)) as {
    readonly default?: Record<string, unknown>;
  };
  const recipe = imported.default;
  if (!recipe || typeof recipe.id !== "string") {
    throw new Error(`Recipe module has no defineRecipe default export: ${modulePath}`);
  }
  const scripts = (recipe.scripts ?? {}) as Readonly<Record<string, AnyScriptRef>>;
  return {
    id: recipe.id,
    workflowPath: resolveWorkflowPath(absoluteDir, recipe.defaultAction),
    scripts,
    scriptNames: Object.keys(scripts),
  };
}
