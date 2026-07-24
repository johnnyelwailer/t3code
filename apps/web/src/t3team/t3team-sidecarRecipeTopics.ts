import { getBundledT3WorkRecipe } from "@t3tools/t3team-skill-packs";

import type { T3workSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

export function filterT3workSidecarRecipesByTopic(
  quickStarts: ReadonlyArray<T3workSidecarRecipeQuickStart>,
  topic: string,
): ReadonlyArray<T3workSidecarRecipeQuickStart> {
  return quickStarts.filter((quickStart) => getBundledT3WorkRecipe(quickStart.id)?.topic === topic);
}
