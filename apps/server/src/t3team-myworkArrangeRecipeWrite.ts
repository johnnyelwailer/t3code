import * as Effect from "effect/Effect";

import { renderMyWorkArrangeRecipe } from "./t3team-myworkArrangeRecipeTemplate.ts";
import { parseMyWorkArrangeRecipeSpec } from "./t3team-myworkArrangeRecipeSpec.ts";
import { writeViewRecipe } from "./t3team-viewRecipeWrite.ts";

/** My Work's `recipe` mode: validate the interview spec, render, write through the generic writer. */
export const writeMyWorkArrangeRecipe = (workspaceRoot: string, input: unknown) => {
  const parsed = parseMyWorkArrangeRecipeSpec(input);
  if (!parsed.ok) return Effect.fail(parsed.message);
  const rendered = renderMyWorkArrangeRecipe(parsed.spec);
  return writeViewRecipe({ workspaceRoot, id: parsed.spec.id, ...rendered });
};
