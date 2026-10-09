/**
 * G12 precedence, as one pure function over already-loaded, already-normalized layers:
 *
 *   1 the recipe's own `defaults` < 2 config `defaults` < 3 each matching scope, in file order
 *   < 4 the caller's `with` block for this recipe < 5 this run's own values.
 *
 * Values merge per key; a plain object (`duties`) merges per field; lists and references
 * replace. `with` blocks merge the same way, per target recipe. Each key's source is the highest
 * layer that set it, with its line in the config file.
 */
import type { RecipeConfigSource, RecipeConfigWarning, ResolvedRecipeConfig } from "@t3team/sdk";

type Values = Readonly<Record<string, unknown>>;

export interface RecipeConfigLayers {
  readonly file: string | null;
  readonly recipeDefaults: Values;
  readonly defaults: Values;
  readonly scopes: ReadonlyArray<Values & { readonly repos?: ReadonlyArray<string> }>;
  readonly keyLines: Readonly<Record<string, number>>;
  readonly warnings: ReadonlyArray<RecipeConfigWarning>;
}

/** References are opaque values: a `{ kind }` object never merges with another. */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !("kind" in value) &&
  Object.getPrototypeOf(value) === Object.prototype;

function mergeValue(lower: unknown, higher: unknown): unknown {
  if (!isPlainObject(lower) || !isPlainObject(higher)) return higher;
  const merged: Record<string, unknown> = { ...lower };
  for (const [key, value] of Object.entries(higher)) merged[key] = mergeValue(lower[key], value);
  return merged;
}

/** `owner/name` (or `host/owner/name`) against one pattern with `*` globs, case-insensitive. */
export function repositoryMatches(pattern: string, repository: string): boolean {
  const target = repository
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "");
  const wanted = pattern.trim().toLowerCase();
  const segments = wanted.split("/").length;
  // A two-segment pattern names `owner/name` on any host.
  const subject = segments === 2 ? target.split("/").slice(-2).join("/") : target;
  const source = wanted
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${source}$`).test(subject);
}

export function resolveRecipeConfigLayers(
  layers: RecipeConfigLayers,
  query: {
    readonly repository?: string | undefined;
    readonly caller?: Values | undefined;
    readonly run?: Values | undefined;
  },
): ResolvedRecipeConfig {
  const values: Record<string, unknown> = {};
  const sources: Record<string, RecipeConfigSource> = {};
  const withBlocks: Record<string, Record<string, unknown>> = {};
  const apply = (layer: Values, source: (key: string) => RecipeConfigSource) => {
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined || key === "repos") continue;
      if (key === "with") {
        for (const [recipe, block] of Object.entries((value ?? {}) as Values)) {
          withBlocks[recipe] = mergeValue(withBlocks[recipe] ?? {}, block) as Record<
            string,
            unknown
          >;
        }
        continue;
      }
      values[key] = key in values ? mergeValue(values[key], value) : value;
      sources[key] = source(key);
    }
  };
  const line = (path: string) => layers.keyLines[path];
  const at = <T extends object>(source: T, path: string) => {
    const found = line(path);
    return found === undefined ? source : { ...source, line: found };
  };

  apply(layers.recipeDefaults, () => ({ layer: "recipe" }));
  apply(layers.defaults, (key) => at({ layer: "defaults" as const }, `defaults.${key}`));
  layers.scopes.forEach((scope, index) => {
    const repository = query.repository;
    if (repository === undefined) return;
    if (!(scope.repos ?? []).some((pattern) => repositoryMatches(pattern, repository))) return;
    apply(scope, (key) => at({ layer: "scope" as const, index }, `scopes[${index}].${key}`));
  });
  if (query.caller !== undefined) apply(query.caller, () => ({ layer: "caller" }));
  if (query.run !== undefined) apply(query.run, () => ({ layer: "run" }));
  return { values, sources, with: withBlocks, file: layers.file, warnings: layers.warnings };
}
