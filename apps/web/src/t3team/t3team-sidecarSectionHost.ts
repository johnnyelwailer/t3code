import type { RecipeSurface } from "@t3tools/project-recipes";

import type { T3TeamRecipeQuickStartLaunchCustomization } from "~/t3team/t3team-recipeQuickStartLaunch";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipes";

export type SidecarSectionPlacement = "sidecar.section";

export type SidecarSectionHost = {
  readonly placement: SidecarSectionPlacement;
  readonly surface: RecipeSurface;
  readonly projectId: string;
  readonly stageKickoff: (
    recipe: T3TeamSidecarRecipeQuickStart,
    customization?: T3TeamRecipeQuickStartLaunchCustomization,
  ) => void;
  readonly launchRecipe: (recipeId: string, parameters?: Record<string, unknown>) => void;
  /**
   * Sends a quick start on click: a workflow-backed recipe starts its workflow, a prompt-backed one
   * sends its prompt as the new thread's first message. No extra Submit. The Quick Start card's
   * body click and the RunToggle's "on" both route through this.
   */
  readonly launchQuickStart: (
    recipe: T3TeamSidecarRecipeQuickStart,
    customization?: T3TeamRecipeQuickStartLaunchCustomization,
  ) => Promise<boolean>;
  readonly openThread: (threadId: string) => void;
};

export function buildSidecarSectionHost(host: SidecarSectionHost): SidecarSectionHost {
  return host;
}
