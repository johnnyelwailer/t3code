import { EnvironmentId, type CloudSession, type ScopedProjectRef } from "@t3tools/contracts";
import { useEffect, useMemo, useRef } from "react";

import { openAddProjectToMachine } from "~/components/AddProjectToMachineDialog";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { useClientSettings } from "~/hooks/useSettings";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import { useProject, useProjects } from "~/state/entities";
import { followCloudSessionProject } from "./t3team-cloudSessionProjectFollow";
import { getCloudSessionTarget } from "./t3team-cloudSessionTargetStore";

/**
 * The composer project's logical key, the same one the machine list groups by, so a project
 * on another machine counts as the same project. Null while there is no project.
 */
export function useCloudSessionProjectKey(projectRef: ScopedProjectRef | null): string | null {
  const project = useProject(projectRef);
  const settings = useClientSettings();
  return useMemo(
    () =>
      project === null
        ? null
        : deriveLogicalProjectKeyFromSettings(project, selectProjectGroupingSettings(settings)),
    [project, settings],
  );
}

function sessionEnvironmentId(
  sessions: readonly CloudSession[],
  sessionId: string,
): string | undefined {
  const environmentId = sessions
    .find((item) => item.sessionId === sessionId)
    ?.environmentId?.trim();
  return environmentId === undefined || environmentId.length === 0 ? undefined : environmentId;
}

function machineHasComposerProject(input: {
  readonly sessionId: string;
  readonly projectKey: string;
  readonly sessions: readonly CloudSession[];
  readonly projects: ReadonlyArray<{
    readonly environmentId: string;
    readonly logicalKey: string;
  }>;
}): boolean | undefined {
  const environmentId = sessionEnvironmentId(input.sessions, input.sessionId);
  if (environmentId === undefined) return undefined;
  return input.projects.some(
    (project) => project.environmentId === environmentId && project.logicalKey === input.projectKey,
  );
}

/**
 * When the composer project changes during pending cloud setup, keep the same machine
 * and move the waiting thread and queued message to the new project. If that project is
 * missing on the machine, add it with the existing add-project-to-machine path.
 */
export function useCloudSessionProjectFollow(input: {
  readonly scopeKey: string | null;
  readonly draftId: string | null;
  readonly projectKey: string | null;
  readonly projectRef: ScopedProjectRef | null;
  readonly sessions: readonly CloudSession[];
}): void {
  const { scopeKey, draftId, projectKey, projectRef, sessions } = input;
  const settings = useClientSettings();
  const projects = useProjects();
  const grouping = selectProjectGroupingSettings(settings);
  const projectsOnMachines = useMemo(
    () =>
      projects.map((project) => ({
        environmentId: String(project.environmentId),
        logicalKey: deriveLogicalProjectKeyFromSettings(project, grouping),
      })),
    [projects, grouping],
  );
  const addedFor = useRef<string | null>(null);

  useEffect(() => {
    if (scopeKey === null) return;
    const target = getCloudSessionTarget(scopeKey);
    const sessionId = target?.sessionId;
    const hasProject =
      sessionId === undefined || projectKey === null
        ? undefined
        : machineHasComposerProject({
            sessionId,
            projectKey,
            sessions,
            projects: projectsOnMachines,
          });
    const openAdd = (addSessionId: string) => {
      if (projectRef === null) return;
      const environmentId = sessionEnvironmentId(sessions, addSessionId);
      if (environmentId === undefined) return;
      const addKey = `${scopeKey}:${projectKey}:${addSessionId}`;
      if (addedFor.current === addKey) return;
      addedFor.current = addKey;
      openAddProjectToMachine({
        projectRef,
        targetEnvironmentId: EnvironmentId.make(environmentId),
      });
    };
    const result = followCloudSessionProject(scopeKey, projectKey, {
      draftId,
      machineHasProject: hasProject,
      moveThread: ({ draftId: id }) => {
        if (projectRef === null) return;
        const store = useComposerDraftStore.getState();
        const key = DraftId.make(id);
        const draft = store.getDraftSession(key);
        if (draft === undefined || draft.promotedTo) return;
        store.setDraftThreadContext(key, {
          projectRef,
          environmentSelection: "manual",
          loadBalancedEnvironmentId: null,
        });
      },
      addProjectToMachine: ({ sessionId: addSessionId }) => {
        openAdd(addSessionId);
      },
    });
    // If the stamp already matches, still add once the machine environment is known.
    if (
      (result.kind === "retargeted" && result.addedProject) ||
      hasProject !== false ||
      sessionId === undefined
    )
      return;
    openAdd(sessionId);
  }, [scopeKey, draftId, projectKey, projectRef, sessions, projectsOnMachines]);
}
