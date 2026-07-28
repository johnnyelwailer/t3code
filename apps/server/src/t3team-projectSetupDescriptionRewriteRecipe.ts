/**
 * The `describe-rewrite` bundled recipe's workflow body — the ONE implementation behind every
 * "rewrite this description" entry point.
 *
 * SHAPE (Epic 25 engine format, not the retired `export const steps` union):
 *   1. `thread.askUser` — a DETERMINISTIC gate, but ONLY when the caller arrived with nothing. No
 *      model runs before the human has said what should change; attaching a note and submitting IS
 *      that statement, so re-confirming it would cost a click and gather nothing. With intent
 *      supplied this step does not exist.
 *   2. `thread.askAgent` — the writer turn, ON THE LAUNCH THREAD. Never `agent()`/`spawnThread()`:
 *      a workflow child thread is created with no tool context and is invisible to the user, so a
 *      draft proposed there would reach nobody (see t3team-workflowChildPlacement.ts).
 *   3. the BODY calls `t3team.work_item.description.draft_update`. The agent only writes PROSE —
 *      it never touches the tool — so "exactly one draft, always reviewed" is a property of the
 *      engine rather than of prompt obedience.
 *
 * WHY THE WRITER PROMPT IS AUTHORED HERE
 * The web control this backs used to build its own prompt telling the agent to CALL the draft tool
 * itself; that builder was deleted when the control moved onto this workflow, because here the
 * BODY owns the call and an agent that also called it would produce two drafts for one rewrite.
 * The writer's contract is "return prose, touch nothing", and it lives with the body that enforces it.
 *
 * WHERE THE BODY LIVES
 * Bundled recipes reach a user's disk through project-setup scaffolding
 * (`renderBundledRecipeSetupFiles`), the same way `create-recipe` and `edit-plugin-module` ship
 * their `workflow.ts`. The packed server has no source tree to read at runtime, so the text must be
 * embedded — but it is embedded from a REAL module (`./t3team-descriptionRewrite.workflow.ts`) via
 * a `?raw` import that the bundler inlines at BUILD time. The compiler therefore checks the exact
 * artifact the engine executes, and its companion test still runs that text through the real
 * engine.
 *
 * @module t3team-projectSetupDescriptionRewriteRecipe
 */

// The body's TEXT, inlined at build time. It is a real module (typechecked, navigable) that is
// never IMPORTED as code here — only its source is, which is exactly what gets written to disk.
import body from "./t3team-descriptionRewrite.workflow.ts?raw";

import {
  T3TEAM_PROJECT_RECIPES_ROOT,
  type T3TeamProjectSetupFile,
} from "./t3team-projectSetupShared.ts";

export const DESCRIPTION_REWRITE_RECIPE_ID = "describe-rewrite";

/** This recipe's scaffolded extras — empty for every other bundled recipe. */
export function descriptionRewriteSetupFiles(
  recipeId: string,
): ReadonlyArray<T3TeamProjectSetupFile> {
  if (recipeId !== DESCRIPTION_REWRITE_RECIPE_ID) return [];
  return [
    {
      relativePath: `${T3TEAM_PROJECT_RECIPES_ROOT}/${recipeId}/workflow.ts`,
      contents: renderDescriptionRewriteWorkflow(),
      writeMode: "if-missing",
    },
  ];
}

/** The scaffolded `workflow.ts` for {@link DESCRIPTION_REWRITE_RECIPE_ID}. */
export function renderDescriptionRewriteWorkflow(): string {
  return body;
}
