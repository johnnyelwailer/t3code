/**
 * The project list My Work scopes its digest to — and the SAME list the startup gate probes with.
 *
 * The digest caches per scope signature, which is built from exactly these projects, so the gate
 * and the view sharing one list is what makes the startup redirect paint from the gate's own fetch
 * instead of starting over.
 *
 * `null` means "not known yet", NOT "none". The stored list starts as a partial localStorage
 * snapshot and environments answer one by one, so a digest scoped to an early read is a smaller
 * scope that can legitimately come back empty. Callers must render a loading state for `null` and
 * must not let an empty state through until this is an array.
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { Project } from "~/types";

import { useAllEnvironmentShellsBootstrapped, useProjects } from "~/state/entities";
import { ensureStoredProjectsHydrated } from "~/t3team/hooks/t3team-projectStorePersistence";
import {
  readStoredProjectsSnapshot,
  subscribeStoredProjectsSnapshot,
} from "~/t3team/hooks/t3team-storedProjectsSnapshot";
import {
  deriveLooseWorkspaceProjects,
  reconcileStoredProjectsWithLive,
} from "~/t3team/hooks/t3team-projectStoreUtils";
import { selectBoundProjects } from "~/t3team/t3team-allProjectsMyWorkProjects";

/** The hydrated stored projects, or `null` until the page's one hydration resolves. */
export function useHydratedStoredProjects(): ReadonlyArray<ProjectShellProject> | null {
  useEffect(() => {
    void ensureStoredProjectsHydrated();
  }, []);
  return useSyncExternalStore(
    subscribeStoredProjectsSnapshot,
    readStoredProjectsSnapshot,
    readStoredProjectsSnapshot,
  );
}

/** Stored projects reconciled against live ones, then filtered to those with a work source. */
export function selectMyWorkBoundProjects(
  storedProjects: ReadonlyArray<ProjectShellProject>,
  liveProjects: ReadonlyArray<Project>,
): ReadonlyArray<ProjectShellProject> {
  return selectBoundProjects([
    ...reconcileStoredProjectsWithLive(storedProjects, liveProjects),
    ...deriveLooseWorkspaceProjects(storedProjects, liveProjects),
  ]);
}

export function useMyWorkBoundProjects(): ReadonlyArray<ProjectShellProject> | null {
  const storedProjects = useHydratedStoredProjects();
  const liveProjects = useProjects();
  // Until every environment has answered (or given up), a missing project only means "not yet".
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  return useMemo(
    () =>
      storedProjects === null || !bootstrapped
        ? null
        : selectMyWorkBoundProjects(storedProjects, liveProjects),
    [bootstrapped, liveProjects, storedProjects],
  );
}
