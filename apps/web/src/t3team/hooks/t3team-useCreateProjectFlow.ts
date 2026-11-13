/* oxlint-disable t3code/no-manual-memo -- this file compiles; existing useMemo stays to avoid a behavior sweep */
import { useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";

import type { ProjectShellProject } from "@t3tools/project-context";

import { useProjects } from "~/state/entities";
import { useT3TeamProjectSetupProfile } from "~/t3team/t3team-projectSetupProfile";
import { parseT3TeamRouteSearch } from "~/t3team/t3team-routeState";

import { mapBoundProjectIds } from "./t3team-createProjectCatalogRows";
import { decideOpenExisting, isProjectKnown } from "./t3team-openExistingCreateProject";
import { useCreateProjectNavigation } from "./t3team-createProjectNavigation";
import { useCreateProjectSubmit } from "./t3team-useCreateProjectSubmit";
import { useJiraProjectCatalogState } from "./t3team-useJiraProjectCatalogState";
import { useLinkedRepositorySelection } from "./t3team-useLinkedRepositorySelection";

/**
 * All state of the add-a-Jira-project page, so the page component only has to draw it.
 *
 * Where the user is comes from the URL (`?project=`), what they have chosen so far lives here and
 * survives stepping back to the project list and forward again. Choosing a different project
 * clears the repository selection (see `useLinkedRepositorySelection`).
 */
export function useCreateProjectFlow(onCreated: (project: ProjectShellProject) => void) {
  const projectKey = useSearch({
    strict: false,
    select: (search) => parseT3TeamRouteSearch(search as Record<string, unknown>).project,
  });
  const catalogState = useJiraProjectCatalogState();
  const appProjects = useProjects();
  const boundProjectIds = useMemo(() => mapBoundProjectIds(appProjects), [appProjects]);
  const navigation = useCreateProjectNavigation(projectKey);
  const selection = useLinkedRepositorySelection(projectKey);
  // Working style is never asked per project: new projects simply inherit whatever profile is
  // current (see t3team-workProfileChooser.ts).
  const setupProfileId = useT3TeamProjectSetupProfile();
  const { state: submitState, submit } = useCreateProjectSubmit(projectKey);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | undefined>();

  const entry = projectKey
    ? (catalogState.catalog.find((candidate) => candidate.entryKey === projectKey) ?? null)
    : null;
  const existingProjectId = entry ? (boundProjectIds.get(entry.entryKey) ?? null) : null;

  const deepLinkExistingId =
    existingProjectId !== null && submitState.kind === "idle" ? existingProjectId : null;

  const openExisting = (projectId: string) => {
    const decision = decideOpenExisting({
      existingProjectId: projectId,
      projectKnown: isProjectKnown(projectId, appProjects),
    });
    if (decision.action === "error") {
      setOpenError(decision.message);
      setPendingOpenId(null);
      return;
    }
    if (decision.action === "open") {
      setOpenError(undefined);
      setPendingOpenId(decision.projectId);
      // Navigate in the handler (a click or Add on a project already in the app), not
      // in a standing effect: that effect retriggered when the page stayed mounted.
      navigation.openProject(decision.projectId);
    }
  };

  const create = async () => {
    if (!entry) return;
    // Already in the app (the project list had not caught up when the form opened): open it.
    if (existingProjectId !== null) {
      openExisting(existingProjectId);
      return;
    }
    const project = await submit({
      entry,
      linkedRepositoryUrls: selection.linkedRepositoryUrls,
      setupProfileId,
      onRecordCreated: (record) => {
        // The form already has everything it needs: leave and open the project
        // the instant the record exists. Clones continue in the background.
        navigation.leaveThen(() => onCreated(record));
      },
    });
    // Finalize may have moved the workspace or detected a main repository: refresh the store.
    if (project) onCreated(project);
  };

  return {
    projectKey,
    entry,
    /** A deep link names a project that a connected site's finished catalog does not have. */
    projectMissing:
      Boolean(projectKey) &&
      entry === null &&
      !catalogState.loading &&
      catalogState.error === null &&
      catalogState.connected === true,
    /** A click already requested the leave; show "Opening…" (do not navigate again). */
    pendingOpenId,
    /** A deep link named a project the app already has; the page performs a mount-once leave. */
    deepLinkExistingId,
    /** The chosen project is already in the app and is being opened rather than set up again. */
    openingExisting: pendingOpenId !== null || deepLinkExistingId !== null,
    openExisting,
    openError,
    /** A deep link names a project and the catalog is still being read. */
    resolvingProject: Boolean(projectKey) && entry === null && catalogState.loading,
    catalogState,
    boundProjectIds,
    navigation,
    selection,
    submitState,
    creating: submitState.kind === "creating",
    create,
  };
}

export type CreateProjectFlow = ReturnType<typeof useCreateProjectFlow>;
