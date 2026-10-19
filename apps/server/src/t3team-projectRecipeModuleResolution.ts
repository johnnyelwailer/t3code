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
 * untouched; only when it fails do we resolve an allow-listed specifier from the server itself.
 * Nothing that already resolved changes behaviour, which is what makes a process-global hook safe
 * to install here.
 *
 * The allow-list is deliberately tiny and matches Epic 16 §Supported authoring subset: the
 * authoring SDK, plus `effect` because a recipe's `scripts/<name>.ts` — reached by a real (not
 * type-only) import from `recipe.ts` — declares its input/output schemas with `Schema`. Everything
 * else stays unresolvable: a recipe must not be able to reach into whatever the server happens to
 * have installed, so this is not a general escape hatch into the host's dependency tree.
 *
 * Testing note: `vp test` runs through vite-plus, which owns module resolution in that
 * environment, so a Node `registerHooks` fallback does not apply there. The end-to-end test runs
 * the hook in a child Node process against a published-bundle layout instead.
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
 * `@t3team/sdk` are inlined into the bundle; the build emits one entry per root (vite.config.ts)
 * that re-exports the bundle's chunk, so a recipe shares the instance the host itself runs.
 * Subpaths are not covered.
 */
const BUNDLED_HOST_MODULES: Readonly<Record<string, string>> = {
  effect: "./t3team-hostEffect.mjs",
  "@t3team/sdk": "./t3team-hostSdk.mjs",
};

function bundledHostModule(specifier: string, hostUrl: string): string | undefined {
  const sibling = BUNDLED_HOST_MODULES[specifier];
  if (sibling === undefined) return undefined;
  const url = new URL(sibling, hostUrl);
  return NodeFS.existsSync(NodeURL.fileURLToPath(url)) ? url.href : undefined;
}

/**
 * The URL `specifier` resolves to from the server's bundle, or else from its own installation.
 *
 * The bundle entry wins because the installed copy is not loadable in the packaged desktop app:
 * `server.asar/node_modules/@t3team/sdk` ships the workspace package's raw `.ts` sources, and Node
 * refuses to strip types under `node_modules` (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING).
 */
export function resolveFromHost(
  specifier: string,
  hostUrl: string = import.meta.url,
  resolve: (specifier: string) => string = (name) => import.meta.resolve(name),
): string {
  const bundled = bundledHostModule(specifier, hostUrl);
  if (bundled !== undefined) return bundled;
  try {
    return resolve(specifier);
  } catch (error) {
    const root = RESOLVABLE_PACKAGES.find((name) => specifier.startsWith(`${name}/`));
    if (root !== undefined) {
      // A subpath resolves from a development checkout but has no entry in a published bundle.
      throw new Error(
        `Cannot resolve "${specifier}" from the published server: recipe modules may import only the bare "${root}" there (subpaths are not bundled). Import { ... } from "${root}" instead.`,
        { cause: error },
      );
    }
    throw error;
  }
}

/** The query parameter a recipe config import carries (t3team-recipeConfigLoad.ts). */
export const CONFIG_VERSION_PARAM = "t3team-config";

/**
 * A recipe config is imported with `?t3team-config=<version>`; every file it imports inherits
 * that version, so an edited policy script reloads with the config instead of staying cached
 * for the life of the process. Only relative imports of a versioned parent change: a package
 * (the SDK, `effect`) is loaded once, never a fresh copy per config edit.
 */
export function withConfigVersion(
  url: string,
  parentURL: string | undefined,
  specifier: string,
): string {
  if (parentURL === undefined || !url.startsWith("file:") || !specifier.startsWith(".")) {
    return url;
  }
  const version = new URL(parentURL).searchParams.get(CONFIG_VERSION_PARAM);
  if (version === null) return url;
  const child = new URL(url);
  if (child.searchParams.has(CONFIG_VERSION_PARAM)) return url;
  child.searchParams.set(CONFIG_VERSION_PARAM, version);
  return child.toString();
}

/**
 * Recipe, workflow and script modules are always ESM, but Node picks a `.ts` file's format from
 * the nearest ancestor `package.json`: `"type": "commonjs"` makes it CommonJS outright ("Cannot
 * use import statement outside a module"), and a missing `"type"` leaves the format to Node's
 * syntax detection. A recipe lives in the user's own workspace, so whatever `package.json` sits
 * above it is not ours to depend on.
 *
 * Only a result Node already decided is CommonJS is re-loaded as ESM; everything else, including
 * `.cts`/`.mts` files whose extension fixes the format, passes through untouched.
 */
const loadTypescriptAsEsm: NonNullable<Parameters<typeof NodeModule.registerHooks>[0]["load"]> = (
  url,
  context,
  nextLoad,
) => {
  const loaded = nextLoad(url, context);
  return loaded.format === "commonjs-typescript"
    ? nextLoad(url, { ...context, format: "module-typescript" })
    : loaded;
};

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
    load: loadTypescriptAsEsm,
    resolve(specifier, context, nextResolve) {
      try {
        const resolved = nextResolve(specifier, context);
        const url = withConfigVersion(resolved.url, context.parentURL, specifier);
        return url === resolved.url ? resolved : { ...resolved, url };
      } catch (error) {
        if (!isResolvableFromHost(specifier)) {
          throw error;
        }
        // Resolved against THIS module — the server's own bundle or installation — which is
        // exactly the copy the imported recipe should share, so an author's `defineRecipe`
        // result is instanceof the same registry the host reads.
        return { url: resolveFromHost(specifier), shortCircuit: true };
      }
    },
  });
}
