/**
 * A recipe's own `defaults` (`defineRecipe({ defaults })`), the lowest config layer, as
 * journalable data: a `defineWorkflow` ref keeps its absolute path, references stay `{ kind, … }`
 * data, and anything that is not data (a script function) is left out, so the slot falls to the
 * recipe's built-in default.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { importRecipeModuleRef } from "./t3team-projectRecipeDiscoveryModule.ts";

type Layer = Readonly<Record<string, unknown>>;

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

/** The recipe module's `defaults`, or none when it has no `recipe.ts` or it fails to load. */
export const loadRecipeDefaults = (recipeModule: string | undefined) =>
  recipeModule === undefined
    ? Effect.succeed<Layer>({})
    : importRecipeModuleRef(recipeModule).pipe(
        Effect.option,
        Effect.map((ref) => recipeDefaultsAsData(Option.getOrUndefined(ref)?.defaults ?? {})),
      );
