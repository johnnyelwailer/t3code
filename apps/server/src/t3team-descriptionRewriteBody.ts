/**
 * The `describe-rewrite` body as TEXT, for whichever loader is running us — see
 * `t3team-moduleSourceText.ts` for why a `?raw` import is never trusted blind.
 */

import rawBody from "./t3team-descriptionRewrite.workflow.ts?raw";
import { resolveModuleSourceText } from "./t3team-moduleSourceText.ts";

/** Kept in a const so bundlers do not mistake it for a static asset reference to rewrite. */
const WORKFLOW_FILE = "./t3team-descriptionRewrite.workflow.ts";

/** The exact text written to `.t3team/recipes/describe-rewrite/workflow.ts`. */
export const DESCRIPTION_REWRITE_WORKFLOW_BODY = resolveModuleSourceText({
  inlined: rawBody,
  fileUrl: new URL(WORKFLOW_FILE, import.meta.url),
  // Every workflow body declares this. Its absence means we are holding code, not source text.
  marker: "export const meta",
  label: "describe-rewrite workflow body",
});
