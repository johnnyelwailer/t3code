// @effect-diagnostics nodeBuiltinImport:off - build-time bundler plugin; it runs outside any Effect runtime.
/**
 * Ship TypeScript's lib declarations next to the emitted chunks.
 *
 * `vp pack` inlines the TypeScript compiler into the server bundle (see
 * packages/runbook-ts/src/typescript.ts), so the orchestration host works from
 * the packaged asar where no node_modules is reachable. The inlined compiler
 * locates each default lib file at `dirname(chunk)/<name>` (for example
 * `dist/lib.esnext.d.ts`): the executing file is the SDK chunk itself, and the
 * compiler joins the lib file name straight onto its directory, with no `lib/`
 * subdirectory. So the lib declarations are written directly into the output
 * directory, beside the chunks. Without them every global type (`Record`,
 * `Promise`, ...) is unresolved in a packaged workflow type-check (`ts2304`,
 * `ts2583`); the missing-lib diagnostic itself carries no file, so the
 * type-check step drops it and only the symptoms surface.
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
      NodeFS.mkdirSync(outDir, { recursive: true });
      // Only the default libraries (`lib.*.d.ts`): the compiler API typings
      // (typescript.d.ts) are staged separately into the asar's node_modules.
      const files = NodeFS.readdirSync(libDir).filter(
        (file) => file.startsWith("lib.") && file.endsWith(".d.ts"),
      );
      for (const file of files) {
        NodeFS.copyFileSync(NodePath.join(libDir, file), NodePath.join(outDir, file));
      }
    },
  };
}
