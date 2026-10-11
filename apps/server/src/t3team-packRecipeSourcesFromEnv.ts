/**
 * Pack recipe sources for a server that compiles its distribution in.
 *
 * The compiled-in distribution carries a pack's provider, theme and policies inside the bundle, but
 * a recipe is a directory of modules that the discovery and launch pipeline imports from disk, so
 * its files cannot be inlined (docs/nexi-work/design/distribution-build-input.md, Phase 2). A host
 * that has the pack on disk next to a published bundle (a cloud session) names it with
 * `T3TEAM_PACKS_DIR`, exactly as the `t3team` binary reads it, and the recipes it declares become
 * available, for instance to `T3CODE_KICKOFF_RECIPE`.
 *
 * Recipes ONLY: the pack's activation entry is not imported here, so nothing is applied twice
 * against the compiled-in baseline, and the pack's own dependencies need not be installed. The
 * `t3team` binary registers the full runtime pack first (overlays included); its recipe sources win.
 */
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { inspectConfiguredWorkspacePacks } from "./t3team-pack-host.ts";
import {
  getPackRecipeSources,
  loadPackRecipeSources,
  setPackRecipeSources,
} from "./t3team-packRecipeSources.ts";

export const activatePackRecipeSources = Effect.gen(function* () {
  if (getPackRecipeSources().sources.length > 0) return;
  const packsDir = yield* Config.String("T3TEAM_PACKS_DIR").pipe(Config.option);
  const diagnostic = yield* Effect.promise(() =>
    inspectConfiguredWorkspacePacks(Option.getOrUndefined(packsDir)),
  );
  if (!diagnostic.enabled) return;
  for (const issue of diagnostic.issues) {
    yield* Effect.logWarning("Workspace pack skipped", { issue });
  }
  const recipeSources = loadPackRecipeSources(diagnostic);
  setPackRecipeSources(recipeSources);
  for (const message of recipeSources.diagnostics) {
    yield* Effect.logWarning("Workspace pack recipe source skipped", { diagnostic: message });
  }
}).pipe(
  Effect.catch((cause) =>
    Effect.logWarning("Workspace pack recipe sources failed to load; continuing without them", {
      cause,
    }),
  ),
);
