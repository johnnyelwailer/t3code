/**
 * The `describe-rewrite` body as TEXT, for whichever loader is running us. See
 * `./t3team-workflowBodyText.ts` for why a `?raw` import is validated instead of trusted.
 */

import rawBody from "./t3team-descriptionRewrite.workflow.ts?raw";
import { resolveWorkflowBodyText } from "./t3team-workflowBodyText.ts";

/** Kept in a const so bundlers do not mistake it for a static asset reference to rewrite. */
const WORKFLOW_FILE = "./t3team-descriptionRewrite.workflow.ts";

/** The exact text written to `.t3team/recipes/describe-rewrite/workflow.ts`. */
export const DESCRIPTION_REWRITE_WORKFLOW_BODY = resolveWorkflowBodyText(
  rawBody,
  new URL(WORKFLOW_FILE, import.meta.url),
);
