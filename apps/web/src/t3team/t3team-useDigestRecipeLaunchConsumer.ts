import { useEffect, useRef } from "react";

import { resolveDigestRecipe, useDigestRecipeCatalog } from "~/t3team/t3team-digestRecipeCatalog";
import {
  buildDigestRecipeLaunchCustomization,
  scopeDigestRecipeQuickStart,
} from "~/t3team/t3team-digestRecipeLaunch";
import {
  settleDigestRecipeLaunch,
  useDigestRecipeLaunchStore,
} from "~/t3team/t3team-digestRecipeLaunchStore";
import type {
  T3TeamRecipeQuickStartLaunchCustomization,
  T3TeamSelectedRecipeQuickStart,
} from "~/t3team/t3team-recipeQuickStartLaunch";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

/**
 * The dashboard kickoff composer's side of a digest recipe pill: a request for this project is
 * staged through the composer's own `stageRecipeKickoff` — the path a quick-start card and a
 * `/alias` take — as the PR-scoped catalog recipe. The request settles once that staging ends
 * (cleared, launched, or replaced), or when the composer unmounts.
 */
export function useDigestRecipeLaunchConsumer(input: {
  readonly projectId: string;
  readonly selectedRecipe: T3TeamSelectedRecipeQuickStart | null;
  readonly stageRecipeKickoff: (
    recipe: T3TeamSidecarRecipeQuickStart,
    customization?: T3TeamRecipeQuickStartLaunchCustomization,
  ) => void;
}) {
  const { projectId, selectedRecipe, stageRecipeKickoff } = input;
  const catalog = useDigestRecipeCatalog();
  const request = useDigestRecipeLaunchStore((state) => state.request);
  const staged = useRef<{ readonly requestId: number; shown: boolean } | null>(null);

  useEffect(() => {
    if (!request || request.scope.projectId !== projectId) return;
    if (staged.current?.requestId === request.id) return;
    const quickStart = resolveDigestRecipe(catalog, request.recipeId, projectId);
    if (!catalog || !quickStart) return;
    staged.current = { requestId: request.id, shown: false };
    stageRecipeKickoff(
      scopeDigestRecipeQuickStart({
        quickStart,
        catalogInput: catalog.catalogInput,
        scope: request.scope,
      }),
      buildDigestRecipeLaunchCustomization(request.scope),
    );
  }, [catalog, projectId, request, stageRecipeKickoff]);

  useEffect(() => {
    const current = staged.current;
    if (!current) return;
    if (selectedRecipe) {
      current.shown = true;
      return;
    }
    if (current.shown) {
      staged.current = null;
      settleDigestRecipeLaunch(current.requestId);
    }
  }, [selectedRecipe]);

  useEffect(
    () => () => {
      if (staged.current) settleDigestRecipeLaunch(staged.current.requestId);
    },
    [],
  );
}
