import type { ProjectShellProject } from "@t3tools/project-context";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useBackend } from "~/t3team/backend/t3team-index";
import { readProjectSetupProfileIdFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import { buildDigestRecipeCatalogInput } from "~/t3team/t3team-digestRecipeLaunch";
import { useT3TeamSidecarRecipeQuickStarts } from "~/t3team/t3team-sidecarRecipes";
import type {
  T3TeamSidecarRecipeInput,
  T3TeamSidecarRecipeQuickStart,
} from "~/t3team/t3team-sidecarRecipeTypes";

/**
 * The PR recipes the dashboard can launch, by id: the recipes discovered for the PR-detail
 * surface, through the same discovery the aside's quick starts use. A digest pill shows only
 * when its recipe is in here, so an unshipped or disabled recipe renders no dead button.
 */
export type DigestRecipeCatalog = {
  readonly projectId: string;
  readonly catalogInput: T3TeamSidecarRecipeInput;
  readonly recipes: ReadonlyMap<string, T3TeamSidecarRecipeQuickStart>;
};

const DigestRecipeCatalogContext = createContext<DigestRecipeCatalog | null>(null);

/**
 * Resolves the catalog for the project dashboard. `launchable` is false while the aside cannot
 * show the kickoff composer (an embedded thread holds it); the catalog then reads as empty.
 */
export function DigestRecipeCatalogProvider({
  project,
  launchable,
  children,
}: {
  readonly project: ProjectShellProject;
  readonly launchable: boolean;
  readonly children: ReactNode;
}) {
  const backend = useBackend();
  const profileId = readProjectSetupProfileIdFromProject(project);
  const catalogInput = useMemo(
    () => buildDigestRecipeCatalogInput({ project, profileId }),
    [profileId, project],
  );
  const quickStarts = useT3TeamSidecarRecipeQuickStarts({ ...catalogInput, backend });
  const catalog = useMemo<DigestRecipeCatalog>(
    () => ({
      projectId: project.id,
      catalogInput,
      recipes: new Map(quickStarts.map((quickStart) => [quickStart.id, quickStart])),
    }),
    [catalogInput, project.id, quickStarts],
  );
  return (
    <DigestRecipeCatalogContext.Provider value={launchable ? catalog : null}>
      {children}
    </DigestRecipeCatalogContext.Provider>
  );
}

/** The catalog, or null where nothing can launch (no provider: the all-projects view, stories). */
export function useDigestRecipeCatalog(): DigestRecipeCatalog | null {
  return useContext(DigestRecipeCatalogContext);
}

/** The catalog recipe a pill would stage for an item of `projectId`, or null when it can not. */
export function resolveDigestRecipe(
  catalog: DigestRecipeCatalog | null,
  recipeId: string,
  projectId: string,
): T3TeamSidecarRecipeQuickStart | null {
  if (!catalog || catalog.projectId !== projectId) return null;
  return catalog.recipes.get(recipeId) ?? null;
}
