// @effect-diagnostics nodeBuiltinImport:off - resolves its own source text at boot, outside any Effect runtime.
/**
 * The `describe-rewrite` body as TEXT, for whichever loader is running us.
 *
 * THREE loaders reach this module and only two honour `?raw`:
 *   • `vp test` (vite) — inlines the file's text. ✔
 *   • `vp pack` (tsdown/rolldown) — inlines it too, via `scripts/t3team-rawTextPackPlugin.ts`. ✔
 *   • `node --watch src/bin.ts` (the dev backend) — node's resolver IGNORES the `?raw` query and
 *     imports the module as CODE, so `rawBody` is the default-exported `run` FUNCTION. Coercing
 *     that to a string yields `"async function run() { …"`, which was silently scaffolded into
 *     user workspaces and failed at launch with "has no top-level `const meta = …` declaration".
 *
 * So the text is never trusted blind: it is VALIDATED, and when what we hold is not source we read
 * the source off disk (dev always runs from `src`, so the file is right there). If neither yields
 * source the process fails at BOOT — a loud startup error beats writing garbage to a user's repo.
 */

import * as NodeFS from "node:fs";

import rawBody from "./t3team-descriptionRewrite.workflow.ts?raw";

/** Kept in a const so bundlers do not mistake it for a static asset reference to rewrite. */
const WORKFLOW_FILE = "./t3team-descriptionRewrite.workflow.ts";

/** Every workflow body declares this. Its absence means we are holding code, not source text. */
const META_MARKER = "export const meta";

function resolveBodyText(): string {
  // `unknown`, because under the dev loader this is a function no matter what the type says.
  const inlined: unknown = rawBody;
  if (typeof inlined === "string" && inlined.includes(META_MARKER)) return inlined;
  const fromDisk = NodeFS.readFileSync(new URL(WORKFLOW_FILE, import.meta.url), "utf8");
  if (!fromDisk.includes(META_MARKER)) {
    throw new Error(
      `The describe-rewrite workflow body did not resolve to source text (no '${META_MARKER}'). ` +
        `A '?raw' import returned ${typeof inlined}; ${WORKFLOW_FILE} did not supply it either. ` +
        `Scaffolding it would write a broken workflow.ts into a user's workspace.`,
    );
  }
  return fromDisk;
}

/** The exact text written to `.t3team/recipes/describe-rewrite/workflow.ts`. */
export const DESCRIPTION_REWRITE_WORKFLOW_BODY = resolveBodyText();
