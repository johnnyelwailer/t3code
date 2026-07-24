/**
 * Pack-provided recipe sources (Epic 16 §Scope + §Recipe Sources And Precedence).
 *
 * The spec is explicit that recipes are not project-only: "Recipes can be supplied by project
 * packs, user packs, distribution packs, or remote-managed workspace packs … Scope is determined
 * by where the pack/module is installed". A pack declares them as `contents.recipes: [{id, path}]`
 * where `path` is a pack-relative recipe directory holding the usual `recipe.ts` / `recipe.json`.
 *
 * This module only resolves and registers the roots; the recipes themselves are loaded by the one
 * shared discovery pipeline (`t3work-projectRecipeDiscoveryPack.ts`), never a forked copy.
 */

import { resolvePackAssetPath, type WorkspacePackScope } from "@t3work/packs";

import type { WorkspacePackHostDiagnostic } from "./t3work-pack-host.ts";

export const PACK_RECIPE_CAPABILITY = "recipe:v1";

export type PackRecipeSource = {
  readonly packId: string;
  readonly packVersion: string;
  readonly packScope: WorkspacePackScope;
  /** Recipe id the manifest declares. The authored recipe's own id must match it. */
  readonly declaredId: string;
  /** Absolute path to the recipe directory inside the pack. */
  readonly recipeRoot: string;
};

export type PackRecipeSourceLoad = {
  readonly sources: readonly PackRecipeSource[];
  readonly diagnostics: readonly string[];
};

let registered: PackRecipeSourceLoad = { sources: [], diagnostics: [] };

export function setPackRecipeSources(load: PackRecipeSourceLoad): void {
  registered = load;
}

export function getPackRecipeSources(): PackRecipeSourceLoad {
  return registered;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Resolve every `contents.recipes` entry of every active pack into an absolute recipe root.
 *
 * Two gates, both diagnostics rather than startup failures (a bad optional distribution must not
 * lock the user out of the host — same rule `inspectConfiguredWorkspacePacks` follows):
 *  - `recipe:v1` capability is required, peer to `theme:v1` / `setup-profile:v1`;
 *  - the path must stay inside the pack directory (`resolvePackAssetPath` rejects absolute paths
 *    and `..` escapes), matching the `resolveWithinRoot` guard project-local discovery uses.
 */
export function loadPackRecipeSources(
  diagnostic: WorkspacePackHostDiagnostic,
): PackRecipeSourceLoad {
  const sources: PackRecipeSource[] = [];
  const diagnostics: string[] = [];

  for (const pack of diagnostic.resolution?.packs ?? []) {
    const refs = pack.manifest.contents.recipes ?? [];
    if (refs.length === 0) continue;
    if (!pack.manifest.capabilities.includes(PACK_RECIPE_CAPABILITY)) {
      diagnostics.push(
        `Pack ${pack.manifest.id} declares recipes without the ${PACK_RECIPE_CAPABILITY} capability; its recipes are ignored.`,
      );
      continue;
    }
    for (const ref of refs) {
      try {
        sources.push({
          packId: pack.manifest.id,
          packVersion: pack.manifest.version,
          packScope: pack.manifest.scope ?? "distribution",
          declaredId: ref.id,
          recipeRoot: resolvePackAssetPath(pack.directory, ref.path),
        });
      } catch (error) {
        diagnostics.push(
          `Pack ${pack.manifest.id} recipe ${ref.id} was skipped: ${errorMessage(error)}`,
        );
      }
    }
  }

  return { sources, diagnostics };
}
