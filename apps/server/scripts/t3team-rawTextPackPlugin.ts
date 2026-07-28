// @effect-diagnostics nodeBuiltinImport:off - build-time bundler plugin; it runs outside any Effect runtime.
/**
 * `?raw` support for `vp pack`.
 *
 * Vite (and therefore `vp test`) inlines a `foo.ts?raw` import as the file's TEXT out of the box.
 * `vp pack` is tsdown/rolldown WITHOUT vite's asset pipeline, so the same specifier fails to
 * resolve and the CLI bundle cannot be built. This plugin gives pack the same semantics.
 *
 * Why it matters: it is what lets source that SHIPS AS TEXT (a bundled recipe's `workflow.ts`,
 * scaffolded into a user's workspace) be authored as a real, typechecked module instead of a
 * string literal no compiler ever reads. The text is embedded at BUILD time, so the packed server
 * still needs no source tree at runtime.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const SUFFIX = "?raw";

/** Rolldown plugin; typed structurally so this file needs no rolldown type import. */
export function t3teamRawTextPackPlugin(): {
  readonly name: string;
  resolveId(source: string, importer: string | undefined): string | null;
  load(id: string): string | null;
} {
  return {
    name: "t3team-raw-text",
    resolveId(source, importer) {
      if (!source.endsWith(SUFFIX)) return null;
      const target = source.slice(0, -SUFFIX.length);
      if (!target.startsWith(".")) return null;
      const base = importer === undefined ? process.cwd() : NodePath.dirname(importer);
      return NodePath.resolve(base, target) + SUFFIX;
    },
    load(id) {
      if (!id.endsWith(SUFFIX)) return null;
      const file = id.slice(0, -SUFFIX.length);
      const text = NodeFS.readFileSync(file, "utf8");
      return `export default ${JSON.stringify(text)};\n`;
    },
  };
}
