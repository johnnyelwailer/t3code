/**
 * `t3_recipe_validate` for a recipe config file (`<state dir>/recipes/<id>.config.ts`, G12): the
 * data-only check, then a load of every layer with its references resolved. Each problem is an
 * issue with its line, the same text the recipe's card shows as a warning. The settings are only
 * imported once they pass the data-only check.
 */
import type { RecipeToolIssue, ValidateRecipeToolResult } from "@t3team/sdk";
import { checkRecipeConfigSource } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { loadRecipeConfigLayers } from "./t3team-recipeConfigLoad.ts";
import { resolveRecipeActionById } from "./t3team-recipeRunById.ts";

export const isRecipeConfigPath = (path: string) => path.endsWith(".config.ts");

const at = (line: number | undefined, message: string) =>
  line === undefined ? message : `line ${line}: ${message}`;

export const validateRecipeConfigForAgent = Effect.fn("validateRecipeConfigForAgent")(
  function* (input: { readonly workspaceRoot: string; readonly configPath: string }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sourceText = yield* fileSystem.readFileString(input.configPath);
    const checked = checkRecipeConfigSource(input.configPath, sourceText);
    const recipeId = path.basename(input.configPath).replace(/\.config\.ts$/, "");
    const issues: RecipeToolIssue[] = checked.diagnostics.map((diagnostic) => ({
      path: input.configPath,
      phase: "format",
      message: at(diagnostic.line, diagnostic.message),
    }));
    if (checked.recipeId !== null && checked.recipeId !== recipeId) {
      issues.push({
        path: input.configPath,
        phase: "format",
        message: `The file is named for '${recipeId}' but configures '${checked.recipeId}'.`,
      });
    }
    if (issues.length === 0) {
      const recipe = yield* resolveRecipeActionById({
        workspaceRoot: input.workspaceRoot,
        recipeId,
      }).pipe(Effect.option);
      if (recipe._tag === "None") {
        issues.push({
          path: input.configPath,
          phase: "load",
          message: `No runnable recipe '${recipeId}' in this project.`,
        });
      }
      const layers = yield* loadRecipeConfigLayers({
        workspaceRoot: input.workspaceRoot,
        recipeId,
        file: input.configPath,
        recipePath: recipe._tag === "Some" ? recipe.value.recipePath : undefined,
      });
      for (const warning of layers.warnings) {
        issues.push({
          path: warning.file ?? input.configPath,
          phase: "load",
          message: at(
            warning.line,
            warning.key === undefined ? warning.message : `${warning.key}: ${warning.message}`,
          ),
        });
      }
    }
    const result: ValidateRecipeToolResult = { ok: issues.length === 0, errors: issues };
    return result;
  },
);
