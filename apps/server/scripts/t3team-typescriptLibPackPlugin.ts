// @effect-diagnostics nodeBuiltinImport:off - build-time bundler plugin; it runs outside any Effect runtime.
/**
 * Ship TypeScript's lib declarations next to the emitted chunks.
 *
 * `vp pack` inlines the TypeScript compiler into the server bundle (see
 * packages/runbook-ts/src/typescript.ts), so the orchestration host works from
 * the packaged asar where no node_modules is reachable. The inlined compiler
 * locates its default lib files relative to the file it executes from —
 * `dirname(chunk)/lib/` — so a bundle that typechecks workflow source needs the
 * lib declarations beside the chunks in dist/. Without them the typecheck facet
 * degrades to "typecheck-unavailable" in every packaged context.
 *
 * In unbundled contexts (dev, tests) the static import resolves to the
 * workspace typescript package, whose own lib/ directory is used — this plugin
 * only matters for the emitted bundle.
 */

import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";

// Resolve typescript the way the bundled code will: from a package that
// declares it (runbook-ts), so the lib files always match the inlined compiler.
const requireFromRunbookTs = NodeModule.createRequire(
  new URL("../../../packages/runbook-ts/package.json", import.meta.url).href,
);

/** Rolldown plugin; typed structurally so this file needs no rolldown type import. */
export function t3teamTypescriptLibPackPlugin(): {
  readonly name: string;
  writeBundle(outputOptions: { readonly dir?: string | null }): void;
} {
  return {
    name: "t3team-typescript-lib",
    writeBundle(outputOptions) {
      const outDir = outputOptions.dir ?? "dist";
      // typescript's entry is lib/typescript.js, so its lib directory is the
      // entry's own directory.
      const typescriptEntry = requireFromRunbookTs.resolve("typescript");
      const libDir = NodePath.dirname(typescriptEntry);
      const destDir = NodePath.join(outDir, "lib");
      NodeFS.mkdirSync(destDir, { recursive: true });
      const files = NodeFS.readdirSync(libDir).filter((file) => file.endsWith(".d.ts"));
      for (const file of files) {
        NodeFS.copyFileSync(NodePath.join(libDir, file), NodePath.join(destDir, file));
      }
    },
  };
}
