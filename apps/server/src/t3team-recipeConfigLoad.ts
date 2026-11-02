/**
 * Loads one recipe's config layers for a project (G12): the recipe's own `defaults` and the
 * project's `<state dir>/recipes/<recipeId>.config.ts`.
 *
 * The file is checked as data (`checkRecipeConfigSource`) and its relative imports must stay
 * under the state dir, BEFORE anything imports it; a file that fails either is not imported at
 * all, and every key keeps the recipe's default, with one warning per problem naming file and
 * line. A clean file is imported (t3team-recipeConfigImport.ts) and its references normalized.
 * The layers are cached by the modification times of the config, everything it imports and the
 * recipe module, so an unchanged config is not re-imported on every pass.
 */
import { checkRecipeConfigSource, type RecipeConfigWarning } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { projectStateReadPaths } from "./t3team-projectStateReadRoots.ts";
import { loadRecipeDefaults } from "./t3team-recipeConfigDefaults.ts";
import { importCheckedConfig } from "./t3team-recipeConfigImport.ts";
import { collectConfigImports } from "./t3team-recipeConfigImports.ts";
import { normalizeConfigLayer } from "./t3team-recipeConfigRefs.ts";
import type { RecipeConfigLayers } from "./t3team-recipeConfigResolve.ts";

export { recipeDefaultsAsData } from "./t3team-recipeConfigDefaults.ts";

const cache = new Map<string, { readonly version: string; readonly layers: RecipeConfigLayers }>();

export const loadRecipeConfigLayers = Effect.fn("loadRecipeConfigLayers")(function* (input: {
  readonly workspaceRoot: string;
  readonly recipeId: string;
  /** The recipe's directory, for its own `defaults`; absent skips that layer. */
  readonly recipePath: string | undefined;
  /** The config file; defaults to `<state dir>/recipes/<recipeId>.config.ts`. */
  readonly file?: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  // The newest state dir that holds the config is the one it is read from, and the one its
  // imports must stay under; a config in `.agents/nexi` never reaches into the legacy dir.
  const stateRoots = projectStateReadPaths(path, input.workspaceRoot);
  const configName = path.join("recipes", `${input.recipeId}.config.ts`);
  let stateRoot = stateRoots[0]!;
  let file = input.file ?? path.join(stateRoot, configName);
  if (input.file === undefined) {
    for (const root of stateRoots) {
      if (
        yield* fileSystem
          .exists(path.join(root, configName))
          .pipe(Effect.orElseSucceed(() => false))
      ) {
        stateRoot = root;
        file = path.join(root, configName);
        break;
      }
    }
  } else {
    const owner = stateRoots.find(
      (root) => path.relative(root, input.file!).split(/[\\/]/)[0] !== "..",
    );
    if (owner !== undefined) stateRoot = owner;
  }
  const mtime = (target: string) =>
    fileSystem.stat(target).pipe(
      Effect.map((info) =>
        Option.getOrElse(
          Option.map(info.mtime, (at) => at.getTime()),
          () => 0,
        ),
      ),
      Effect.orElseSucceed(() => -1),
    );
  const exists = (yield* mtime(file)) >= 0;
  const recipeModule =
    input.recipePath === undefined ? undefined : path.join(input.recipePath, "recipe.ts");
  const graph = exists ? yield* collectConfigImports(file, stateRoot) : { files: [], outside: [] };
  const version = (yield* Effect.forEach(
    [file, ...graph.files.slice(1), ...(recipeModule === undefined ? [] : [recipeModule])],
    mtime,
  )).join(":");
  const cacheKey = `${file}\0${recipeModule ?? ""}`;
  const cached = cache.get(cacheKey);
  if (cached?.version === version) return cached.layers;

  const warnings: RecipeConfigWarning[] = [];
  const recipeDefaults =
    recipeModule !== undefined && (yield* mtime(recipeModule)) >= 0
      ? yield* loadRecipeDefaults(recipeModule)
      : {};
  const layers = (config: Partial<RecipeConfigLayers>): RecipeConfigLayers => ({
    file: exists ? file : null,
    recipeDefaults,
    defaults: {},
    scopes: [],
    keyLines: {},
    warnings,
    ...config,
  });
  let result = layers({});
  const source = exists ? yield* fileSystem.readFileString(file) : "";
  const checked = exists ? checkRecipeConfigSource(file, source) : undefined;
  const refuse = (message: string, line?: number) =>
    warnings.push({ message, file, ...(line === undefined ? {} : { line }) });
  if (checked !== undefined) {
    for (const diagnostic of checked.diagnostics) {
      refuse(
        `${diagnostic.message} The config is not loaded; using the recipe's defaults.`,
        diagnostic.line,
      );
    }
    for (const outside of graph.outside) {
      refuse(`It imports ${outside}, outside ${stateRoot}; the config is not loaded.`);
    }
    if (checked.recipeId !== null && checked.recipeId !== input.recipeId) {
      refuse(
        `This config is for '${checked.recipeId}', not '${input.recipeId}'; it is not loaded.`,
      );
    }
  }
  if (checked !== undefined && warnings.length === 0) {
    const loaded = yield* importCheckedConfig({ file, version, checkedSource: source });
    if ("problem" in loaded) {
      refuse(loaded.problem);
    } else {
      const context = { ...checked, workspaceRoot: input.workspaceRoot, stateRoot, file };
      const defaults = yield* normalizeConfigLayer(
        context,
        loaded.config.defaults ?? {},
        "defaults",
        warnings,
      );
      const scopes = yield* Effect.forEach(loaded.config.scopes ?? [], (scope, index) =>
        normalizeConfigLayer(context, scope, `scopes[${index}]`, warnings),
      );
      result = layers({ defaults, scopes, keyLines: checked.keyLines });
    }
  }
  cache.set(cacheKey, { version, layers: result });
  return result;
});
