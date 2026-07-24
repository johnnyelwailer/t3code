/**
 * The origin a discovered recipe is labelled with (Epic 16 §Recipe Sources And Precedence).
 *
 * "Pack-provided recipes and project-local recipes are the **same concept with different
 * sources**" — so both flow through one discovery pipeline and differ only by this label plus
 * the root directory they are scanned from.
 */

import type { ProjectRecipeDiscovered } from "@t3tools/project-recipes";

export type ProjectRecipeOrigin =
  | { readonly source: "project-local" }
  | {
      readonly source: "pack";
      readonly packId: string;
      readonly packScope: string;
    };

export const PROJECT_LOCAL_ORIGIN: ProjectRecipeOrigin = { source: "project-local" };

/** Spread onto a `ProjectRecipeDiscovered` so pack fields stay absent for project-local recipes. */
export function originFields(
  origin: ProjectRecipeOrigin,
): Pick<ProjectRecipeDiscovered, "source" | "packId" | "packScope"> {
  return origin.source === "pack"
    ? { source: "pack", packId: origin.packId, packScope: origin.packScope }
    : { source: "project-local" };
}

/**
 * Precedence per Epic 16: `core defaults → distribution packs → global packs → user packs →
 * project packs → remote-managed packs → explicit locks`. Project-local recipes sit at the
 * project layer's authored end, so they win over any pack-provided recipe of the same id.
 * Higher number wins.
 */
const PACK_SCOPE_PRECEDENCE: Readonly<Record<string, number>> = {
  distribution: 1,
  global: 2,
  user: 3,
  project: 4,
  "remote-managed": 5,
};

export function originPrecedence(recipe: ProjectRecipeDiscovered): number {
  if (recipe.source !== "pack") return 100;
  return PACK_SCOPE_PRECEDENCE[recipe.packScope ?? "distribution"] ?? 1;
}

export function describeOrigin(recipe: ProjectRecipeDiscovered): string {
  return recipe.source === "pack"
    ? `pack ${recipe.packId ?? "unknown"} (${recipe.packScope ?? "distribution"})`
    : "project-local";
}

/**
 * Merge recipes from every active source into one catalog, keyed by recipe id. The
 * highest-precedence contributor for an id wins; every shadowed contributor becomes a
 * diagnostic rather than a silent drop.
 */
export function mergeRecipesByPrecedence(recipes: ReadonlyArray<ProjectRecipeDiscovered>): {
  readonly recipes: ReadonlyArray<ProjectRecipeDiscovered>;
  readonly diagnostics: ReadonlyArray<string>;
} {
  const selected = new Map<string, ProjectRecipeDiscovered>();
  const diagnostics: string[] = [];

  for (const recipe of recipes) {
    const previous = selected.get(recipe.id);
    if (!previous) {
      selected.set(recipe.id, recipe);
      continue;
    }
    const [winner, loser] =
      originPrecedence(recipe) > originPrecedence(previous)
        ? ([recipe, previous] as const)
        : ([previous, recipe] as const);
    selected.set(recipe.id, winner);
    diagnostics.push(
      `Recipe ${recipe.id} from ${describeOrigin(loser)} is shadowed by ${describeOrigin(winner)}.`,
    );
  }

  return { recipes: [...selected.values()], diagnostics };
}
