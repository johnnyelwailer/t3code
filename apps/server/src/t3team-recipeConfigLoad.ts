/**
 * Loads one recipe's config layers for a project (G12): the recipe's own `defaults` and the
 * project's `<state dir>/recipes/<recipeId>.config.ts`.
 *
 * The file is checked as data (`checkRecipeConfigSource`) BEFORE it is imported; a file with
 * errors is not imported at all, and every key keeps the recipe's default, with one warning per
 * error naming file and line. A clean file is imported like `recipe.ts`, versioned so it and the
 * files it imports reload after an edit (t3team-projectRecipeModuleResolution.ts). The loaded
 * layers are cached by the modification times of the config and its relative imports, so an
 * unchanged config is not re-imported on every pass.
 */
import * as NodeURL from "node:url";

import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import { checkRecipeConfigSource, type RecipeConfigWarning } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { importRecipeModuleRef } from "./t3team-projectRecipeDiscoveryModule.ts";
import {
  CONFIG_VERSION_PARAM,
  ensureProjectRecipeModuleResolution,
} from "./t3team-projectRecipeModuleResolution.ts";
import { normalizeConfigLayer } from "./t3team-recipeConfigRefs.ts";
import type { RecipeConfigLayers } from "./t3team-recipeConfigResolve.ts";

type Layer = Readonly<Record<string, unknown>>;

/**
 * A recipe's own `defaults` as journalable data: a `defineWorkflow` ref keeps its absolute path,
 * references stay `{ kind, … }` data, and anything that is not data (a script function) is left
 * out, so the slot falls to the recipe's built-in default.
 */
export function recipeDefaultsAsData(value: unknown): Layer {
  const convert = (item: unknown): unknown => {
    if (typeof item === "function" || typeof item === "symbol" || typeof item === "bigint") {
      return undefined;
    }
    if (Array.isArray(item)) return item.map(convert).filter((entry) => entry !== undefined);
    if (typeof item !== "object" || item === null) return item;
    const record = item as Record<string, unknown>;
    if (record.kind === "workflow" && typeof record.absolutePath === "string") {
      return { kind: "workflow", absolutePath: record.absolutePath };
    }
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      const converted = convert(entry);
      if (converted !== undefined) out[key] = converted;
    }
    return out;
  };
  const converted = convert(value);
  return typeof converted === "object" && converted !== null && !Array.isArray(converted)
    ? (converted as Layer)
    : {};
}
const cache = new Map<string, { readonly version: string; readonly layers: RecipeConfigLayers }>();

export const recipeConfigPath = (path: Path.Path, workspaceRoot: string, recipeId: string) =>
  path.join(workspaceRoot, PROJECT_STATE_DIR, "recipes", `${recipeId}.config.ts`);

export const loadRecipeConfigLayers = Effect.fn("loadRecipeConfigLayers")(function* (input: {
  readonly workspaceRoot: string;
  readonly recipeId: string;
  /** The recipe's directory, for its own `defaults`; absent skips that layer. */
  readonly recipePath: string | undefined;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const stateRoot = path.join(input.workspaceRoot, PROJECT_STATE_DIR);
  const file = recipeConfigPath(path, input.workspaceRoot, input.recipeId);
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
  const recipeModule =
    input.recipePath === undefined ? undefined : path.join(input.recipePath, "recipe.ts");
  const exists = (yield* mtime(file)) >= 0;
  const source = exists ? yield* fileSystem.readFileString(file) : "";
  const checked = exists ? checkRecipeConfigSource(file, source) : undefined;
  const relativeImports = Object.values(checked?.imports ?? {})
    .map((entry) => entry.specifier)
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) => path.resolve(path.dirname(file), specifier));
  const version = (yield* Effect.forEach(
    [file, ...(recipeModule === undefined ? [] : [recipeModule]), ...relativeImports],
    mtime,
  )).join(":");
  const cacheKey = `${file}\0${recipeModule ?? ""}`;
  const cached = cache.get(cacheKey);
  if (cached?.version === version) return cached.layers;

  const warnings: RecipeConfigWarning[] = [];
  let recipeDefaults: Layer = {};
  if (recipeModule !== undefined && (yield* mtime(recipeModule)) >= 0) {
    const ref = yield* importRecipeModuleRef(recipeModule).pipe(Effect.option);
    recipeDefaults = recipeDefaultsAsData(Option.getOrUndefined(ref)?.defaults ?? {});
  }
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
  if (checked !== undefined && checked.diagnostics.length > 0) {
    for (const diagnostic of checked.diagnostics) {
      warnings.push({
        message: `${diagnostic.message} The config is not loaded; using the recipe's defaults.`,
        file,
        line: diagnostic.line,
      });
    }
  } else if (checked !== undefined && checked.recipeId !== input.recipeId) {
    warnings.push({
      message: `This config is for '${checked.recipeId}', not '${input.recipeId}'; it is not loaded.`,
      file,
    });
  } else if (checked !== undefined) {
    ensureProjectRecipeModuleResolution();
    const url = NodeURL.pathToFileURL(file);
    url.searchParams.set(CONFIG_VERSION_PARAM, version.replace(/:/g, "-"));
    const imported = yield* Effect.tryPromise(() => import(url.toString())).pipe(Effect.result);
    const config = (imported._tag === "Success" ? imported.success.default : undefined) as
      | {
          readonly kind?: string;
          readonly defaults?: Layer;
          readonly scopes?: ReadonlyArray<Layer>;
        }
      | undefined;
    if (config?.kind !== "recipe-config") {
      warnings.push({
        message:
          imported._tag === "Failure"
            ? `The config failed to load: ${String(imported.failure)}`
            : "The config's default export is not a defineRecipeConfig(...) result.",
        file,
      });
    } else {
      const context = { ...checked, workspaceRoot: input.workspaceRoot, stateRoot, file };
      const defaults = yield* normalizeConfigLayer(
        context,
        config.defaults ?? {},
        "defaults",
        warnings,
      );
      const scopes = yield* Effect.forEach(config.scopes ?? [], (scope, index) =>
        normalizeConfigLayer(context, scope, `scopes[${index}]`, warnings),
      );
      result = layers({ defaults, scopes, keyLines: checked.keyLines });
    }
  }
  cache.set(cacheKey, { version, layers: result });
  return result;
});
