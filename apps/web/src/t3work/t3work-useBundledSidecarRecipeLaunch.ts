import { useCallback, useMemo, useRef, useState } from "react";
import type { RecipeSurface } from "@t3tools/project-recipes";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import { createDefaultT3workKickoffLaunchConfig } from "~/t3work/t3work-kickoffLaunchConfig";
import {
  areT3workRecipeQuickStartLaunchCustomizationsEqual,
  type T3workRecipeQuickStartLaunchCustomization,
  type T3workSelectedRecipeQuickStart,
} from "~/t3work/t3work-recipeQuickStartLaunch";
import { type T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipes";
import { launchBundledSidecarRecipeThread } from "~/t3work/t3work-sidecarRecipeLaunch";
import { buildSidecarSectionHost } from "~/t3work/t3work-sidecarSectionHost";
import { type T3workKickoffComposerHandle } from "~/t3work/t3work-TicketKickoffComposer";

type CreateBundledRecipeThread = Parameters<
  typeof launchBundledSidecarRecipeThread
>[0]["createThread"];

type BuildSelectedRecipe = (
  recipe: T3workSidecarRecipeQuickStart,
  customization: T3workRecipeQuickStartLaunchCustomization | undefined,
) => T3workSelectedRecipeQuickStart | null;

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
  current: T3workSelectedRecipeQuickStart | null,
  next: T3workSelectedRecipeQuickStart,
): T3workSelectedRecipeQuickStart {
  if (
    current?.recipe.id === next.recipe.id &&
    areT3workRecipeQuickStartLaunchCustomizationsEqual(current.customization, next.customization)
  ) {
    return current;
  }

  return next;
}

export function useBundledSidecarRecipeLaunch(input: UseBundledSidecarRecipeLaunchInput) {
  const composerRef = useRef<T3workKickoffComposerHandle | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<T3workSelectedRecipeQuickStart | null>(null);

  const buildSelectedRecipe = input.buildSelectedRecipe;
  /**
   * Stages a recipe as the composer's pre-submit chip. Shared by the Quick
   * Starts card click and the composer `/<slashAlias>` selection so both entry
   * points reach the one launch path (Epic 16, "Selection semantics").
   */
  const stageRecipeKickoff = useCallback(
    (
      recipe: T3workSidecarRecipeQuickStart,
      customization?: T3workRecipeQuickStartLaunchCustomization,
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
              composerRef.current?.getLaunchConfig() ?? createDefaultT3workKickoffLaunchConfig(),
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
