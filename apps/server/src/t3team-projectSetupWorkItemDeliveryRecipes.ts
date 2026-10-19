/**
 * Scaffolding for the `fix-this-bug` and `implement-this` bundled recipes: each ships its own
 * `workflow.ts` plus a copy of the `unit.workflow.ts` both bodies run as a sub-workflow. The copy
 * keeps each recipe directory self-contained; the repository holds one source for the unit.
 *
 * @module t3team-projectSetupWorkItemDeliveryRecipes
 */

import {
  FIX_THIS_BUG_WORKFLOW_BODY,
  IMPLEMENT_THIS_WORKFLOW_BODY,
  WORK_ITEM_UNIT_WORKFLOW_BODY,
} from "./t3team-workItemDeliveryBodies.ts";
import {
  T3TEAM_PROJECT_RECIPES_ROOT,
  type T3TeamProjectSetupFile,
} from "./t3team-projectSetupShared.ts";
import { renderScaffoldedWorkflowBody } from "./t3team-workflowBodyText.ts";

export const FIX_THIS_BUG_RECIPE_ID = "fix-this-bug";
export const IMPLEMENT_THIS_RECIPE_ID = "implement-this";

/** In the repository the unit carries the fork's file prefix; in a recipe directory it does not. */
const REPOSITORY_UNIT_PATH = "./t3team-workItemUnit.workflow.ts";
const SCAFFOLDED_UNIT_FILE = "unit.workflow.ts";

function renderParentBody(body: string): string {
  return renderScaffoldedWorkflowBody(body).replaceAll(
    REPOSITORY_UNIT_PATH,
    `./${SCAFFOLDED_UNIT_FILE}`,
  );
}

const WORKFLOW_BODIES: Readonly<Record<string, string>> = {
  [FIX_THIS_BUG_RECIPE_ID]: FIX_THIS_BUG_WORKFLOW_BODY,
  [IMPLEMENT_THIS_RECIPE_ID]: IMPLEMENT_THIS_WORKFLOW_BODY,
};

/** This recipe's scaffolded workflow files — empty for every other bundled recipe. */
export function workItemDeliverySetupFiles(
  recipeId: string,
): ReadonlyArray<T3TeamProjectSetupFile> {
  const body = WORKFLOW_BODIES[recipeId];
  if (body === undefined) return [];
  const root = `${T3TEAM_PROJECT_RECIPES_ROOT}/${recipeId}`;
  return [
    {
      relativePath: `${root}/workflow.ts`,
      contents: renderParentBody(body),
      writeMode: "if-missing",
    },
    {
      relativePath: `${root}/${SCAFFOLDED_UNIT_FILE}`,
      contents: renderScaffoldedWorkflowBody(WORK_ITEM_UNIT_WORKFLOW_BODY),
      writeMode: "if-missing",
    },
  ];
}
