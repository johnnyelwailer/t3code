/**
 * Discovers the recipes a project's chat composers offer and publishes them to the catalog store.
 * Mounted once per thread view, so discovery runs on navigation, not on the `/` keystroke.
 */
import type { ProjectShellProject } from "@t3tools/project-context";
import { useEffect } from "react";

import { useProjects } from "~/state/entities";
import { useBackend } from "~/t3team/backend/t3team-index";
import { publishT3TeamComposerRecipeCatalog } from "~/t3team/composer/t3team-composerRecipeCatalogStore";
import { readProjectSetupProfileIdFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import { findLiveProjectForShellProject } from "~/t3team/hooks/t3team-useLiveProjectForShellProject";
import { useHydratedStoredProjects } from "~/t3team/t3team-myWorkBoundProjects";
import { useT3TeamSidecarRecipeQuickStarts } from "~/t3team/t3team-sidecarRecipes";

export function T3TeamComposerRecipeCatalogLoader(props: { readonly projectId: string | null }) {
  const storedProjects = useHydratedStoredProjects();
  const liveProjects = useProjects();
  const { projectId } = props;
  const shellProject =
    projectId === null
      ? null
      : (storedProjects?.find(
          (candidate) => findLiveProjectForShellProject(candidate, liveProjects)?.id === projectId,
        ) ?? null);
  return projectId === null || shellProject === null ? null : (
    <RecipeCatalogDiscovery projectId={projectId} project={shellProject} />
  );
}

function RecipeCatalogDiscovery(props: {
  readonly projectId: string;
  readonly project: ProjectShellProject;
}) {
  const backend = useBackend();
  const { project, projectId } = props;
  const recipes = useT3TeamSidecarRecipeQuickStarts({
    backend,
    surface: "thread.context",
    project,
    profileId: readProjectSetupProfileIdFromProject(project),
    selectedWorkLabel: project.title,
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes discovered recipes to the store every composer of this project reads
  useEffect(() => {
    publishT3TeamComposerRecipeCatalog(projectId, recipes);
  }, [projectId, recipes]);
  return null;
}
