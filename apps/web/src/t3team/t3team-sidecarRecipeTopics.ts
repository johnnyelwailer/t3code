import { getBundledT3TeamRecipe } from "@t3tools/t3team-skill-packs";

import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

export function filterT3TeamSidecarRecipesByTopic(
  quickStarts: ReadonlyArray<T3TeamSidecarRecipeQuickStart>,
  topic: string,
): ReadonlyArray<T3TeamSidecarRecipeQuickStart> {
  return quickStarts.filter((quickStart) => getBundledT3TeamRecipe(quickStart.id)?.topic === topic);
}
