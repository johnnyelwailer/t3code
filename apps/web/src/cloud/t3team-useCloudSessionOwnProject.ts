import type { EnvironmentId, ScopedProjectRef } from "@t3tools/contracts";
import { useMemo } from "react";

import { useProject, useProjects } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import { useCloudSessions } from "~/state/t3team-cloudSessions";
import {
  type CloudSessionOwnProject,
  resolveCloudSessionOwnProject,
} from "./t3team-cloudSessionOwnProject";
import { useCloudSessionTarget } from "./t3team-cloudSessionTargetStore";
import { useCloudSessionProjectKey } from "./t3team-useCloudSessionProjectFollow";

/**
 * The composer's cloud session's own project (`t3team-cloudSessionOwnProject`), so the machine
 * list offers that session's environment for this project and the queued first send binds to it.
 */
export function useCloudSessionOwnProject(
  scopeKey: string | null,
  projectRef: ScopedProjectRef | null,
): CloudSessionOwnProject | null {
  const target = useCloudSessionTarget(scopeKey);
  const projectKey = useCloudSessionProjectKey(projectRef);
  const { sessions } = useCloudSessions();
  const { environments } = useEnvironments();
  const projects = useProjects();
  const project = useProject(projectRef);
  return useMemo(() => {
    const cwdById = new Map<EnvironmentId, string>();
    for (const environment of environments) {
      const cwd = environment.serverConfig?.cwd;
      if (cwd) cwdById.set(environment.environmentId, cwd);
    }
    return resolveCloudSessionOwnProject({
      target,
      project,
      projectKey,
      sessions,
      serverCwdOf: (environmentId) => cwdById.get(environmentId) ?? null,
      projects,
    });
  }, [environments, project, projectKey, projects, sessions, target]);
}
