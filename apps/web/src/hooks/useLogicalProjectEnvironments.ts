import { availableScratchWorkspaceRoot } from "@t3tools/client-runtime/operations/projects";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  type EnvironmentId,
  type ProjectId,
  resolveEnvironmentMachineKind,
} from "@t3tools/contracts";

import type { EnvironmentOption } from "../components/BranchToolbar.logic";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "../logicalProject";
import { useProjects } from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { primaryEnvironmentLabel } from "../connection/t3team-localEnvironmentLabel";
import { logicalProjectPerEnvironment } from "~/cloud/t3team-cloudSessionOwnProject";
import { useCloudSessionOwnProject } from "~/cloud/t3team-useCloudSessionOwnProject";
import { useClientSettings } from "./useSettings";

export function useLogicalProjectEnvironments(
  activeProject: EnvironmentProject | null,
  scratchDraft: boolean,
  cloudSessionScopeKey: string | null = null,
): readonly EnvironmentOption[] {
  const { environments } = useEnvironments();
  const allProjects = useProjects();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  // t3team: the composer's cloud session hosts this project even when its copy groups differently.
  const cloudSessionOwnProject = useCloudSessionOwnProject(
    cloudSessionScopeKey,
    activeProject ? scopeProjectRef(activeProject.environmentId, activeProject.id) : null,
  );

  if (!activeProject) return [];
  const environmentById = new Map(
    environments.map((environment) => [environment.environmentId, environment]),
  );
  const envs: EnvironmentOption[] = [];
  const pushEnvironment = (environmentId: EnvironmentId, projectId: ProjectId | null) => {
    const environment = environmentById.get(environmentId) ?? null;
    const isPrimary = environmentId === primaryEnvironmentId;
    envs.push({
      environmentId,
      projectId,
      // t3team: the user's own machine reads "This computer", not its hostname.
      label: isPrimary
        ? primaryEnvironmentLabel(environment?.label ?? environmentId)
        : (environment?.label ?? environmentId),
      isPrimary,
      machine: resolveEnvironmentMachineKind(environment?.serverConfig ?? null),
      // The dedupe tie-break in `dedupeRunOnEnvironments`: when the same machine sits in
      // the catalog under two ids, the connected row is the live one.
      connected: environment?.connection.phase === "connected",
    });
  };
  if (scratchDraft) {
    for (const environment of environments) {
      const scratchRoot = availableScratchWorkspaceRoot(
        environment.connection.phase,
        environment.serverConfig,
      );
      if (scratchRoot === null && environment.environmentId !== activeProject.environmentId)
        continue;
      const scratchProject =
        environment.environmentId === activeProject.environmentId
          ? activeProject
          : allProjects.find(
              (p) =>
                p.environmentId === environment.environmentId && isScratchProject(p, scratchRoot),
            );
      pushEnvironment(environment.environmentId, scratchProject?.id ?? null);
    }
  } else {
    const logicalKey = deriveLogicalProjectKeyFromSettings(activeProject, projectGroupingSettings);
    // t3team: the composer's cloud session's own project wins its environment.
    for (const entry of logicalProjectPerEnvironment(
      allProjects,
      (p) => deriveLogicalProjectKeyFromSettings(p, projectGroupingSettings) === logicalKey,
      cloudSessionOwnProject,
    )) {
      pushEnvironment(entry.environmentId, entry.projectId);
    }
  }
  envs.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return envs;
}
