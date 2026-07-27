/**
 * Resolve the tool-group scope a recipe launch runs its HOST TOOLS under, from the recipe's own
 * module — never from the launch request.
 *
 * The request body carries an `allowedToolGroups` field and every live caller fills it by echoing
 * the recipe's own declaration back to us, but a field the CLIENT supplies cannot be the thing that
 * decides how far the client may reach: a caller that simply omits it would otherwise be granted
 * unrestricted scope, which makes the restriction opt-in and therefore not a restriction. So the
 * authority is the same declaration discovery reads (`ProjectRecipeDiscovered.allowedToolGroups`),
 * re-read here at launch from `recipe.ts`.
 *
 * FAIL CLOSED. Every path that cannot produce a declaration answers `denied`, and the caller wires
 * no host tools at all. "We could not tell what this recipe is allowed to do" must never resolve to
 * "anything the thread offers" — that is the exact shape of the bug this module exists to prevent.
 * Note that `granted` with an EMPTY list is also restrictive: `normalizeProjectRecipeToolGroups([])`
 * yields `[]`, which admits nothing (only `undefined` means unrestricted, and we never return it).
 *
 * Module-form recipes only. A legacy `recipe.json` recipe resolves to `denied`; Epic 25 §Phases
 * records that every recipe is now authored as `recipe.ts` + `*.workflow.ts`, so the manifest form
 * is a compatibility surface, and declining to grant it host tools is the conservative reading.
 *
 * @module t3team-recipeWorkflowToolScope
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { resolveRecipeActions } from "./t3team-projectRecipeActions.ts";
import { importRecipeModuleRef } from "./t3team-projectRecipeDiscoveryModule.ts";

/** Granted carries the recipe's declared groups; denied carries why, for the launch log. */
export type T3TeamWorkflowHostToolScope =
  | { readonly kind: "granted"; readonly toolGroups: ReadonlyArray<string> }
  | { readonly kind: "denied"; readonly reason: string };

const denied = (reason: string): T3TeamWorkflowHostToolScope => ({ kind: "denied", reason });

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The launching recipe's declared tool groups, or `denied`. Never fails: an unreadable or
 * disowning recipe is a policy answer ("no host tools"), not a launch-breaking error — the run
 * itself is still perfectly valid without them.
 */
export const resolveRecipeHostToolScope = Effect.fn("resolveRecipeHostToolScope")(function* (input: {
  readonly recipePath: string | undefined;
  readonly workflowPath: string;
}) {
  const recipePath = input.recipePath?.trim() ?? "";
  if (recipePath.length === 0) {
    return denied("the launch carries no recipePath, so no recipe declaration can be read");
  }

  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const modulePath = pathService.join(recipePath, "recipe.ts");
  if (!(yield* fileSystem.exists(modulePath).pipe(Effect.orElseSucceed(() => false)))) {
    return denied(`no recipe.ts at '${recipePath}' (a recipe.json recipe declares no host scope)`);
  }

  const loaded = yield* importRecipeModuleRef(modulePath).pipe(Effect.result);
  if (loaded._tag === "Failure") {
    return denied(`recipe module '${modulePath}' failed to load: ${errorMessage(loaded.failure)}`);
  }
  const ref = loaded.success;

  // Ownership, mirroring the scripts resolver: the scope belongs to the recipe that DECLARES this
  // workflow. A launch pointing at some other file must not inherit this recipe's grant.
  // `resolveRecipeActions` swallows per-action resolution failures itself, so an unresolvable
  // action simply never joins the owned set — which denies rather than grants.
  const owned = resolveRecipeActions(pathService, recipePath, ref);
  if (!owned.some((action) => action.workflowPath === input.workflowPath)) {
    return denied(
      `recipe '${ref.id}' does not declare '${input.workflowPath}' as one of its actions`,
    );
  }

  // `?? []` is load-bearing: undefined would read as "unrestricted" downstream.
  return { kind: "granted", toolGroups: ref.allowedToolGroups ?? [] } as const;
});
