// @effect-diagnostics nodeBuiltinImport:off - build-time bundler helper; it runs outside any Effect runtime.
/**
 * Builds the resolver the distribution pack plugin uses for bare imports made by distribution
 * (pack) modules. The pack is compiled into the server bundle, so its runtime surface IS the
 * server's: a pack module's bare imports must resolve against THIS workspace's dependencies, not
 * against whatever node_modules happens to sit above the distribution checkout on the build
 * machine. Without this anchor, a clean build (distribution root without its own node_modules)
 * leaves pack imports like `typebox` external in the emitted bundle — which then needs an
 * ancestor node_modules at boot and crashes the packaged server, which ships no node_modules at
 * all. (`vp pack` runs with the server package as cwd, which is also the basis the rest of the
 * plugin already relies on.)
 */
import * as NodePath from "node:path";
import * as NodeUrl from "node:url";

import { isExternalCliDependency } from "../../../scripts/lib/cli-external-packages.ts";

export const isBareSpecifier = (source: string): boolean =>
  !source.startsWith(".") &&
  !source.startsWith("/") &&
  !source.startsWith("\\") &&
  !source.startsWith("node:") &&
  !source.includes("?");

export const createDistributionImportResolver = (): ((
  source: string,
  importer: string,
) => string | null) => {
  // Anchor at the server package.json so pnpm's per-package links are visible. ESM resolution
  // (`import.meta.resolve`, "import" condition) is required: workspace packages like
  // @t3team/pack-api export ESM-only (`exports.import -> ./src/index.ts`), which `require.resolve`
  // cannot load. Resolution is decided by what THIS bundle inlines, not by the machine's layout.
  const parentURL = NodeUrl.pathToFileURL(NodePath.join(process.cwd(), "package.json")).href;
  return (source, importer) => {
    // Packages the CLI deliberately keeps out of the bundle (native addons and their loaders) are
    // staged next to the artifact instead; keep them on the default path.
    if (isExternalCliDependency(source)) return null;
    try {
      return NodeUrl.fileURLToPath(import.meta.resolve(source, parentURL));
    } catch {
      // A pack module compiled into the bundle can only be self-contained if its bare imports
      // resolve in THIS workspace; an ancestor node_modules at boot is not part of the contract
      // (the packaged server ships none). Fail here, at build time, with an actionable error
      // instead of shipping a bundle that ERR_MODULE_NOT_FOUNDs on first boot.
      throw new Error(
        `[t3code/distribution] pack import ${JSON.stringify(source)} (from ${importer}) does not resolve ` +
          `from the server package's dependencies. The packed server bundles this import, so declare ` +
          `the package in apps/server/package.json (or vendor it inside the distribution).`,
      );
    }
  };
};
