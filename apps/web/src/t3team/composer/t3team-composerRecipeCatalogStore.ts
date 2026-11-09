/**
 * The recipes each project's chat composers offer in their `/` menu, as last discovered.
 * Discovery runs when a thread view mounts (`T3TeamComposerRecipeCatalogLoader`), never while
 * typing: the menu reads whatever is already here, so `/` opens without waiting.
 */
import { create } from "zustand";

import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

type Catalog = ReadonlyArray<T3TeamSidecarRecipeQuickStart>;

const EMPTY_CATALOG: Catalog = [];

type RecipeCatalogState = {
  readonly byProjectId: Readonly<Record<string, Catalog>>;
};

export const useT3TeamComposerRecipeCatalogStore = create<RecipeCatalogState>(() => ({
  byProjectId: {},
}));

export function publishT3TeamComposerRecipeCatalog(projectId: string, recipes: Catalog): void {
  useT3TeamComposerRecipeCatalogStore.setState((state) =>
    state.byProjectId[projectId] === recipes
      ? state
      : { byProjectId: { ...state.byProjectId, [projectId]: recipes } },
  );
}

export function useT3TeamComposerRecipeCatalog(projectId: string | null): Catalog {
  return useT3TeamComposerRecipeCatalogStore((state) =>
    projectId === null ? EMPTY_CATALOG : (state.byProjectId[projectId] ?? EMPTY_CATALOG),
  );
}
