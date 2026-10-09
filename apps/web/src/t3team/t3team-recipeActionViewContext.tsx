/**
 * The quick start a compiled action view is rendering for. MDX components such as `RunToggle`
 * read it to know which recipe they belong to, which project they are shown in, and how that
 * recipe launches; the MDX author does not repeat any of it.
 */
import { createContext, useContext } from "react";

import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

export const T3TeamRecipeActionViewContext = createContext<T3TeamSidecarRecipeQuickStart | null>(
  null,
);

export function useRecipeActionViewRecipe(): T3TeamSidecarRecipeQuickStart | null {
  return useContext(T3TeamRecipeActionViewContext);
}
