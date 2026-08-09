/* oxlint-disable t3code/no-inline-schema-compile -- Matches the sibling sidecar-section placement schema style. */
/**
 * The `action` placement helper (Epic 19 §Plugin SDK Surface: "`defineAction` — placement
 * `action` — Recipe launcher in a dedicated action list (usually wrapped by a Quick Starts
 * `defineSidecarSection`)").
 *
 * This is the typed authoring shape for what the live quick-starts surface already renders:
 * a recipe launcher card whose face is an action-view module (`RecipeAction` + its launch
 * inputs), bound to a recipe id and a set of surfaces. The bundled packs run their action views
 * through this gate ({@link ../../t3team-skill-packs/src/recipes.ts}) and the web layer lifts the
 * gated view into `quickStart.actionView.source`
 * ({@link ../../../apps/web/src/t3team/t3team-sidecarRecipes.ts}) — `defineAction` gives that
 * contribution a name, a version, and a decode gate, per the epic's naming principle
 * (surface + role, no generic `defineBlock`).
 *
 * Stage-1 binds the view as inline module SOURCE (the shape the renderer consumes). The
 * path-based `view: "./App.tsx"` form in the epic's multi-placement example arrives with the
 * views/miniapp unification (Epic 19 §Custom Views, still Planned), so it is deliberately not
 * accepted here yet.
 */
import * as Schema from "effect/Schema";

import { RecipeSurface } from "./t3team-sdk.surface.ts";

export const ActionDefinition = Schema.Struct({
  /** Placement-contribution id — unique within its owning pack / project. */
  id: Schema.String,
  version: Schema.String,
  /** The recipe this launcher launches (`defineRecipe`'s / the manifest's `id`). */
  recipeId: Schema.String,
  /** Where the launcher may appear. */
  surfaces: Schema.Array(RecipeSurface),
  /** The action-view module source: `export default function Action({ ctx }) { … }`. */
  view: Schema.String,
  /** Optional ordering hint within the host action list (higher sorts first). */
  rank: Schema.optional(Schema.Number),
  shortDescription: Schema.optional(Schema.String),
});
export type ActionDefinition = typeof ActionDefinition.Type;

const DEFAULT_EXPORT = /export\s+default\b/;

/**
 * Validate and freeze an `action`-placement contribution. Rejects an empty surface list (a
 * launcher nobody can see) and a view module with no default export (the renderer mounts the
 * module's default `Action` component, so a missing one is a silent blank card).
 */
export function defineAction(definition: ActionDefinition): ActionDefinition {
  const decoded = Schema.decodeSync(ActionDefinition)(definition);
  if (decoded.id.trim().length === 0) {
    throw new Error("Action placement must include a non-empty id.");
  }
  if (decoded.recipeId.trim().length === 0) {
    throw new Error(`Action '${decoded.id}' must reference a non-empty recipeId.`);
  }
  if (decoded.surfaces.length === 0) {
    throw new Error(
      `Action '${decoded.id}' declares no surfaces; a launcher with no surface can never render.`,
    );
  }
  if (!DEFAULT_EXPORT.test(decoded.view)) {
    throw new Error(
      `Action '${decoded.id}': 'view' must be an action-view module with a default export ` +
        `(\`export default function Action({ ctx }) { … }\`).`,
    );
  }
  return Object.freeze(decoded);
}
