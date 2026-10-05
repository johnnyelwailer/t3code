/**
 * The Team home's project-less chat, on upstream's Scratch project ("No project").
 *
 * A chat started from the home kickoff aside lives in the environment's Scratch project — the
 * same place the command palette's "new thread without a project" puts it — so project-less
 * threads have one home. The Scratch project is an ordinary server project once it exists, so it
 * reaches the t3team store as a loose workspace; until then the aside offers to create it
 * (`startScratch`) instead of rendering for a project that does not exist yet.
 */
import type { ProjectShellProject } from "@t3tools/project-context";
import { useCallback, useMemo } from "react";

import { useScratchProject } from "~/hooks/useScratchProject";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { normalizeWorkspaceRootPath } from "~/t3team/hooks/t3team-threadProjectResolution";

/** The store project whose workspace is the environment's Scratch folder, if it exists yet. */
export function findScratchProject(
  projects: ReadonlyArray<ProjectShellProject>,
  scratchWorkspaceRoot: string | null,
): ProjectShellProject | null {
  const scratchRoot = normalizeWorkspaceRootPath(scratchWorkspaceRoot);
  if (scratchRoot === null) return null;
  return (
    projects.find(
      (project) => normalizeWorkspaceRootPath(project.workspace?.rootPath) === scratchRoot,
    ) ?? null
  );
}

export function useT3TeamScratchHomeChat(allProjects: ReadonlyArray<ProjectShellProject>) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { scratchEnvironmentId, scratchWorkspaceRootFor, openScratchProject } = useScratchProject();
  const environmentId = scratchEnvironmentId(primaryEnvironmentId);
  const scratchWorkspaceRoot = scratchWorkspaceRootFor(environmentId);
  const scratchProject = useMemo(
    () => findScratchProject(allProjects, scratchWorkspaceRoot),
    [allProjects, scratchWorkspaceRoot],
  );
  const startScratch = useCallback(() => {
    if (environmentId !== null) void openScratchProject(environmentId);
  }, [environmentId, openScratchProject]);

  return {
    scratchProject,
    /** Creates the Scratch project; absent when no connected environment offers one. */
    startScratch: environmentId === null || scratchProject !== null ? undefined : startScratch,
  };
}
