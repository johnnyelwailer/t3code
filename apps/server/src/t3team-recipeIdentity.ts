/**
 * A recipe directory → the recipe's declared id: the pack manifest's id for a pack recipe, else
 * the `id` its `recipe.ts` declares, else the directory's name. It scopes `launchThread` keys and
 * names the recipe's config file, so both follow the id the recipe list and G11 use, wherever the
 * recipe is installed. Cached per directory for the life of the process: a recipe that changes
 * its declared id keeps its old scope until the server restarts.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { getPackRecipeSources } from "./t3team-packRecipeSources.ts";
import { importRecipeModuleRef } from "./t3team-projectRecipeDiscoveryModule.ts";

const known = new Map<string, string>();
const normalized = (path: string) => path.trim().replace(/[\\/]+$/, "");

const recipeIdForPath = (recipePath: string) =>
  Effect.gen(function* () {
    const key = normalized(recipePath);
    const cached = known.get(key);
    if (cached !== undefined) return cached;
    const pack = getPackRecipeSources().sources.find(
      (source) => normalized(source.recipeRoot) === key,
    );
    const declared =
      pack?.declaredId ??
      Option.getOrUndefined(
        yield* importRecipeModuleRef(`${key}/recipe.ts`).pipe(
          Effect.map((ref) => ref.id),
          Effect.option,
        ),
      );
    const id = declared ?? key.split(/[\\/]/).pop() ?? key;
    known.set(key, id);
    return id;
  });

/** `recipe:<declared id>` for a recipe run, `run:<runId>` for any other. */
export const launchScopeFor = (input: { readonly runId: string; readonly recipePath?: string }) =>
  input.recipePath === undefined
    ? Effect.succeed(`run:${input.runId}`)
    : Effect.map(recipeIdForPath(input.recipePath), (id) => `recipe:${id}`);
