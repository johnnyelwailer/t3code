// @effect-diagnostics nodeBuiltinImport:off - resolves source text at boot, outside any Effect runtime.
/**
 * A module's SOURCE TEXT from a `?raw` import, for whichever loader is running us.
 *
 * THREE loaders reach a `?raw` import and only two honour it:
 *   • `vp test` (vite) — inlines the file's text. ✔
 *   • `vp pack` (tsdown/rolldown) — inlines it too, via `scripts/t3team-rawTextPackPlugin.ts`. ✔
 *   • `node --watch src/bin.ts` (the dev backend) — node's resolver IGNORES the `?raw` query and
 *     imports the module as CODE, so the import is the module's default export. Coercing that to a
 *     string yields `"async function run() { …"`, which was silently scaffolded into user
 *     workspaces and failed at launch with "has no top-level `const meta = …` declaration".
 *
 * So the text is never trusted blind: it is VALIDATED by a marker every such module declares, and
 * when what we hold is not source we read the source off disk (dev always runs from `src`, so the
 * file is right there). If neither yields source the process fails at BOOT — a loud startup error
 * beats writing garbage to a user's repo.
 *
 * @module t3team-moduleSourceText
 */
import * as NodeFS from "node:fs";

export function resolveModuleSourceText(input: {
  /** The `?raw` import; `unknown`, because under the dev loader it is code whatever the type says. */
  readonly inlined: unknown;
  /** The module file, resolved against the importing module's `import.meta.url`. */
  readonly fileUrl: URL;
  /** Text only the module's source contains. */
  readonly marker: string;
  /** Names the module in the boot error. */
  readonly label: string;
}): string {
  const { inlined, marker } = input;
  if (typeof inlined === "string" && inlined.includes(marker)) return inlined;
  const fromDisk = NodeFS.readFileSync(input.fileUrl, "utf8");
  if (!fromDisk.includes(marker)) {
    throw new Error(
      `The ${input.label} did not resolve to source text (no '${marker}'). ` +
        `A '?raw' import returned ${typeof inlined}; ${input.fileUrl.pathname} did not supply it either. ` +
        `Scaffolding it would write a broken module into a user's workspace.`,
    );
  }
  return fromDisk;
}
