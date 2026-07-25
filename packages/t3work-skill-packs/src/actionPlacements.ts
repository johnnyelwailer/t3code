/**
 * Runs every bundled recipe's action view through the SDK's `action`-placement gate
 * (`defineAction`, Epic 19 §Plugin SDK Surface) instead of shipping the view as an unchecked
 * string. The gate rejects an empty surface list and a view module with no default export — both
 * of which would otherwise reach the renderer as a silently blank launcher card.
 *
 * The bundled catalog keeps its own `Recipe`-shaped entries (they are recipes first, and the
 * `action` placement is the launcher face of one), so this module derives the placement from the
 * recipe instead of asking each entry to declare it twice. `recipes.ts` then exposes the gated
 * definition as `actionPlacement` and reads `actionViewTemplate` back off it, so there is one
 * source for the view source.
 */
import { type ActionDefinition, defineAction } from "@t3work/sdk/placements";

/** The bundled-recipe fields the `action` placement is derived from. */
export interface BundledActionPlacementInput {
  readonly id: string;
  readonly version: string;
  readonly surfaces: ActionDefinition["surfaces"];
  readonly view: string;
  readonly shortDescription?: string | undefined;
  readonly rankHint?: number | undefined;
}

/**
 * Build the `action`-placement contribution for one bundled recipe. Throws (at module load, so
 * a bad view can never ship) when the view or its surfaces are unrenderable.
 */
export function buildBundledActionPlacement(
  input: BundledActionPlacementInput,
): ActionDefinition {
  return defineAction({
    // Placement ids are namespaced by their recipe: one launcher per bundled recipe today.
    id: `${input.id}.action`,
    version: input.version,
    recipeId: input.id,
    surfaces: input.surfaces,
    view: input.view,
    ...(input.rankHint === undefined ? {} : { rank: input.rankHint }),
    ...(input.shortDescription === undefined
      ? {}
      : { shortDescription: input.shortDescription }),
  });
}
