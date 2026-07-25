import { useCallback, useMemo, useRef, useState } from "react";
import type { RecipeSurface } from "@t3tools/project-recipes";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { createDefaultT3TeamKickoffLaunchConfig } from "~/t3team/t3team-kickoffLaunchConfig";
import {
  areT3TeamRecipeQuickStartLaunchCustomizationsEqual,
  type T3TeamRecipeQuickStartLaunchCustomization,
  type T3TeamSelectedRecipeQuickStart,
} from "~/t3team/t3team-recipeQuickStartLaunch";
import { type T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipes";
import { launchBundledSidecarRecipeThread } from "~/t3team/t3team-sidecarRecipeLaunch";
import { buildSidecarSectionHost } from "~/t3team/t3team-sidecarSectionHost";
import { type T3TeamKickoffComposerHandle } from "~/t3team/t3team-TicketKickoffComposer";

type CreateBundledRecipeThread = Parameters<
  typeof launchBundledSidecarRecipeThread
>[0]["createThread"];

type BuildSelectedRecipe = (
  recipe: T3TeamSidecarRecipeQuickStart,
  customization: T3TeamRecipeQuickStartLaunchCustomization | undefined,
) => T3TeamSelectedRecipeQuickStart | null;

type UseBundledSidecarRecipeLaunchInput = {
  readonly backend: BackendApi | null | undefined;
  readonly environmentId: string | null | undefined;
  readonly projectId: string;
  readonly surface: RecipeSurface;
  readonly projectWorkspaceRoot: string | undefined;
  readonly openThread: (threadId: string) => void;
  readonly buildSelectedRecipe: BuildSelectedRecipe;
  readonly createThread: CreateBundledRecipeThread;
  readonly onLaunched: (() => void) | undefined;
};

function preserveSelectedRecipe(
  current: T3TeamSelectedRecipeQuickStart | null,
  next: T3TeamSelectedRecipeQuickStart,
): T3TeamSelectedRecipeQuickStart {
  if (
    current?.recipe.id === next.recipe.id &&
    areT3TeamRecipeQuickStartLaunchCustomizationsEqual(current.customization, next.customization)
  ) {
    return current;
  }

  return next;
}

export function useBundledSidecarRecipeLaunch(input: UseBundledSidecarRecipeLaunchInput) {
  const composerRef = useRef<T3TeamKickoffComposerHandle | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<T3TeamSelectedRecipeQuickStart | null>(null);

  const buildSelectedRecipe = input.buildSelectedRecipe;
  /**
   * Stages a recipe as the composer's pre-submit chip. Shared by the Quick
   * Starts card click and the composer `/<slashAlias>` selection so both entry
   * points reach the one launch path (Epic 16, "Selection semantics").
   */
  const stageRecipeKickoff = useCallback(
    (
      recipe: T3TeamSidecarRecipeQuickStart,
      customization?: T3TeamRecipeQuickStartLaunchCustomization,
    ) => {
      const nextSelectedRecipe = buildSelectedRecipe(recipe, customization);
      if (!nextSelectedRecipe) {
        return;
      }

      setSelectedRecipe((current) => preserveSelectedRecipe(current, nextSelectedRecipe));
    },
    [buildSelectedRecipe],
  );

  const sidecarHost = useMemo(
    () =>
      buildSidecarSectionHost({
        placement: "sidecar.section",
        surface: input.surface,
        projectId: input.projectId,
        stageKickoff: stageRecipeKickoff,
        launchRecipe: (recipeId, parameters) => {
          void launchBundledSidecarRecipeThread({
            backend: input.backend,
            environmentId: input.environmentId,
            projectId: input.projectId,
            surface: input.surface,
            projectWorkspaceRoot: input.projectWorkspaceRoot,
            recipeId,
            ...(parameters ? { parameters } : {}),
            launchConfig:
              composerRef.current?.getLaunchConfig() ?? createDefaultT3TeamKickoffLaunchConfig(),
            createThread: input.createThread,
          }).then((launched) => {
            if (!launched) {
              return;
            }

            input.onLaunched?.();
            setSelectedRecipe(null);
          });
        },
        openThread: input.openThread,
      }),
    [
      input.backend,
      input.createThread,
      input.environmentId,
      input.onLaunched,
      input.openThread,
      input.projectId,
      input.projectWorkspaceRoot,
      input.surface,
      stageRecipeKickoff,
    ],
  );

  return {
    composerRef,
    selectedRecipe,
    stageRecipeKickoff,
    clearSelectedRecipe: () => setSelectedRecipe(null),
    sidecarHost,
  };
}
