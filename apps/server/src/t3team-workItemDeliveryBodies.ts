/**
 * The `fix-this-bug` and `implement-this` bodies, and the unit they share, as TEXT. See
 * `./t3team-workflowBodyText.ts` for why a `?raw` import is validated instead of trusted.
 */

import fixThisBugRaw from "./t3team-fixThisBug.workflow.ts?raw";
import implementThisRaw from "./t3team-implementThis.workflow.ts?raw";
import workItemUnitRaw from "./t3team-workItemUnit.workflow.ts?raw";
import { resolveWorkflowBodyText } from "./t3team-workflowBodyText.ts";

/** Kept in consts so bundlers do not mistake them for static asset references to rewrite. */
const FIX_THIS_BUG_FILE = "./t3team-fixThisBug.workflow.ts";
const IMPLEMENT_THIS_FILE = "./t3team-implementThis.workflow.ts";
const WORK_ITEM_UNIT_FILE = "./t3team-workItemUnit.workflow.ts";

export const FIX_THIS_BUG_WORKFLOW_BODY = resolveWorkflowBodyText(
  fixThisBugRaw,
  new URL(FIX_THIS_BUG_FILE, import.meta.url),
);

export const IMPLEMENT_THIS_WORKFLOW_BODY = resolveWorkflowBodyText(
  implementThisRaw,
  new URL(IMPLEMENT_THIS_FILE, import.meta.url),
);

export const WORK_ITEM_UNIT_WORKFLOW_BODY = resolveWorkflowBodyText(
  workItemUnitRaw,
  new URL(WORK_ITEM_UNIT_FILE, import.meta.url),
);
