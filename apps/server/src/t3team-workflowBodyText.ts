// @effect-diagnostics nodeBuiltinImport:off - resolves source text at boot, outside any Effect runtime.
/**
 * A bundled recipe's workflow body as TEXT, for whichever loader is running us.
 *
 * THREE loaders reach a `?raw` import and only two honour it:
 *   • `vp test` (vite) — inlines the file's text. ✔
 *   • `vp pack` (tsdown/rolldown) — inlines it too, via `scripts/t3team-rawTextPackPlugin.ts`. ✔
 *   • `node --watch src/bin.ts` (the dev backend) — node's resolver IGNORES the `?raw` query and
 *     imports the module as CODE, so the import is the default-exported `run` FUNCTION. Coercing
 *     that to a string yields `"async function run() { …"`, which was silently scaffolded into
 *     user workspaces and failed at launch with "has no top-level `const meta = …` declaration".
 *
 * So the text is never trusted blind: it is VALIDATED, and when what we hold is not source we read
 * the source off disk (dev always runs from `src`, so the file is right there). If neither yields
 * source the process fails at BOOT — a loud startup error beats writing garbage to a user's repo.
 */

import * as NodeFS from "node:fs";

import {
  PROJECT_STATE_DIR,
  T3TEAM_PROJECT_STATE_DIR,
} from "@t3tools/project-context/t3teamProjectStateDir";

/** Every workflow body declares this. Its absence means we are holding code, not source text. */
const META_MARKER = "export const meta";

/**
 * @param inlined what the `?raw` import produced — `unknown`, because under the dev loader it is a
 * function no matter what the type says.
 * @param sourceUrl the body module itself, resolved by the caller against its own `import.meta.url`.
 */
export function resolveWorkflowBodyText(inlined: unknown, sourceUrl: URL): string {
  if (typeof inlined === "string" && inlined.includes(META_MARKER)) return inlined;
  const fromDisk = NodeFS.readFileSync(sourceUrl, "utf8");
  if (!fromDisk.includes(META_MARKER)) {
    throw new Error(
      `The workflow body ${sourceUrl.pathname} did not resolve to source text (no '${META_MARKER}'). ` +
        `A '?raw' import returned ${typeof inlined}, and the file did not supply it either. ` +
        `Scaffolding it would write a broken workflow into a user's workspace.`,
    );
  }
  return fromDisk;
}

/** A body as scaffolded: its prompts address the context mirror under the physical state dir. */
export function renderScaffoldedWorkflowBody(body: string): string {
  return body.replaceAll(`${T3TEAM_PROJECT_STATE_DIR}/context/`, `${PROJECT_STATE_DIR}/context/`);
}
