import { EnvironmentId, type CloudSession, type ScopedProjectRef } from "@t3tools/contracts";
import { useEffect, useMemo } from "react";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import {
  clearCloudProjectCloneSuggestion,
  suggestCloudProjectClone,
} from "./t3team-cloudProjectCloneSuggestion";
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

/** Every project this client can see, tagged with the machine it sits on and its logical key. */
export function useCloudSessionMachineProjects() {
  const projects = useProjects();
  const grouping = selectProjectGroupingSettings(useClientSettings());
  return useMemo(
    () =>
      projects.map((project) => ({
        environmentId: String(project.environmentId),
        projectId: project.id,
        logicalKey: deriveLogicalProjectKeyFromSettings(project, grouping),
      })),
    [projects, grouping],
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
 * and move the waiting thread and queued message to the new project. A project missing on
 * that machine is offered as a clone suggestion, which the user opens the add-project dialog
 * from; this path never opens it by itself.
 */
export function useCloudSessionProjectFollow(input: {
  readonly scopeKey: string | null;
  readonly draftId: string | null;
  readonly projectKey: string | null;
  readonly projectRef: ScopedProjectRef | null;
  readonly sessions: readonly CloudSession[];
}): void {
  const { scopeKey, draftId, projectKey, projectRef, sessions } = input;
  const projectsOnMachines = useCloudSessionMachineProjects();
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
    const suggestClone = (addSessionId: string) => {
      if (projectRef === null) return;
      const environmentId = sessionEnvironmentId(sessions, addSessionId);
      if (environmentId === undefined) return;
      suggestCloudProjectClone({
        scopeKey,
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
        if (draft == null || draft.promotedTo) return;
        store.setDraftThreadContext(key, {
          projectRef,
          environmentSelection: "manual",
          loadBalancedEnvironmentId: null,
        });
      },
      addProjectToMachine: ({ sessionId: addSessionId }) => {
        suggestClone(addSessionId);
      },
    });
    // The machine has the project (or cannot be known yet): any earlier suggestion is moot.
    if (hasProject !== false || sessionId === undefined) {
      if (result.kind !== "retargeted" || !result.addedProject) {
        clearCloudProjectCloneSuggestion(scopeKey);
      }
      return;
    }
    // If the stamp already matches, still suggest once the machine environment is known.
    if (result.kind !== "retargeted" || !result.addedProject) suggestClone(sessionId);
  }, [scopeKey, draftId, projectKey, projectRef, sessions, projectsOnMachines]);
}
