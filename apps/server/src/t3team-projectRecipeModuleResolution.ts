// @effect-diagnostics nodeBuiltinImport:off - a synchronous Node module-resolution hook, outside Effect.
/**
 * Makes the authoring packages resolvable from project-local recipe/workflow modules.
 *
 * A `recipe.ts` in a real workspace lives outside this repo and has no `node_modules`, so
 * `import { defineRecipe } from "@t3team/sdk"` failed with `ERR_MODULE_NOT_FOUND` — the typed
 * module form only ever worked from directories that happen to sit under an install (this repo's
 * test fixtures, or the distribution's pack dir, which links the packages itself). The host owns
 * the runtime that imports these modules, so the host is what should supply their imports.
 *
 * Shape: a FALLBACK resolver, not an override. Default resolution runs first and is returned
 * untouched; only when it fails do we resolve an allow-listed specifier from the server's own
 * installation. Nothing that already resolved changes behaviour, which is what makes a
 * process-global hook safe to install here.
 *
 * The allow-list is deliberately tiny and matches Epic 16 §Supported authoring subset: the
 * authoring SDK, plus `effect` because a recipe's `scripts/<name>.ts` — reached by a real (not
 * type-only) import from `recipe.ts` — declares its input/output schemas with `Schema`. Everything
 * else stays unresolvable: a recipe must not be able to reach into whatever the server happens to
 * have installed, so this is not a general escape hatch into the host's dependency tree.
 *
 * Testing note: `vp test` runs through vite-plus, which owns module resolution in that
 * environment, so a Node `registerHooks` fallback does not apply there — an end-to-end
 * "recipe outside any install" test cannot exercise this under the runner. The predicate below is
 * unit-tested; the end-to-end behaviour was verified by importing a recipe in `/tmp` from a real
 * Node process (it loaded, having failed with ERR_MODULE_NOT_FOUND before this hook existed).
 */

import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeURL from "node:url";

/** Packages a project-local recipe or workflow module may import (plus their subpaths). */
const RESOLVABLE_PACKAGES = ["@t3team/sdk", "effect"] as const;

export function isResolvableFromHost(specifier: string): boolean {
  return RESOLVABLE_PACKAGES.some((name) => specifier === name || specifier.startsWith(`${name}/`));
}

/**
 * Where a PUBLISHED bundle keeps the host's own copy of the two bare roots. `effect` and
 * `@t3team/sdk` are inlined into the bundle and not installed beside it, so `import.meta.resolve`
 * cannot find them there; the build emits one entry per root (vite.config.ts) that re-exports the
 * bundle's chunk, so a recipe shares the instance the host itself runs. Subpaths are not covered.
 */
const BUNDLED_HOST_MODULES: Readonly<Record<string, string>> = {
  effect: "./t3team-hostEffect.mjs",
  "@t3team/sdk": "./t3team-hostSdk.mjs",
};

/** The URL `specifier` resolves to from the server's own installation, or from its bundle. */
export function resolveFromHost(
  specifier: string,
  hostUrl: string = import.meta.url,
  resolve: (specifier: string) => string = (name) => import.meta.resolve(name),
): string {
  try {
    return resolve(specifier);
  } catch (error) {
    const sibling = BUNDLED_HOST_MODULES[specifier];
    if (sibling !== undefined) {
      const url = new URL(sibling, hostUrl);
      if (NodeFS.existsSync(NodeURL.fileURLToPath(url))) return url.href;
    }
    throw error;
  }
}

let installed = false;

/**
 * Install the fallback resolver once per process. Idempotent: every recipe/workflow import path
 * calls it, and registering the same hook repeatedly would stack redundant resolve frames.
 */
export function ensureProjectRecipeModuleResolution(): void {
  if (installed) {
    return;
  }
  installed = true;
  NodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (!isResolvableFromHost(specifier)) {
          throw error;
        }
        // `import.meta.resolve` here resolves against THIS module — i.e. the server's own
        // installation — which is exactly the copy the imported recipe should share, so an
        // author's `defineRecipe` result is instanceof the same registry the host reads.
        return { url: resolveFromHost(specifier), shortCircuit: true };
      }
    },
  });
}
