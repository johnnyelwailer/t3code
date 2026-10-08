/**
 * `pack-ui` `useNavigation`: a pack names a change request and the host opens it on the change
 * requests page, resolving the project the way a pasted change request link is resolved.
 */
import type { ChangeRequestRef, ChangeRequestTab, PackNavigation } from "@t3team/pack-ui/contract";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { sourceControlRepositorySelector } from "@t3tools/shared/sourceControl";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { findProjectForChangeRequest } from "~/lib/openPullRequestLink";
import { useProjects, useServerConfigs } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";

/** The project holding `ref`'s repository: by host and repository, or by repository alone. */
export function findChangeRequestProject(
  projects: ReadonlyArray<EnvironmentProject>,
  ref: ChangeRequestRef,
): EnvironmentProject | undefined {
  if (ref.host !== undefined) {
    return findProjectForChangeRequest(projects, {
      host: ref.host.toLowerCase(),
      repository: ref.repository,
      number: ref.number,
    });
  }
  const repository = ref.repository.toLowerCase();
  return projects.find(
    (project) =>
      sourceControlRepositorySelector(project.repositoryIdentity)?.toLowerCase() === repository,
  );
}

export function usePackNavigation(): PackNavigation {
  const navigate = useNavigate();
  const projects = useProjects();
  const serverConfigs = useServerConfigs();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  return useMemo(() => {
    // Projects on servers that read change requests, the primary server's first.
    const candidates = projects
      .filter(
        (project) =>
          serverConfigs.get(project.environmentId)?.environment.capabilities.pullRequests === true,
      )
      .toSorted(
        (left, right) =>
          Number(right.environmentId === primaryEnvironmentId) -
          Number(left.environmentId === primaryEnvironmentId),
      );
    const open = (ref: ChangeRequestRef, tab: ChangeRequestTab | undefined, file?: string) => {
      const project = findChangeRequestProject(candidates, ref);
      if (project === undefined) return false;
      void navigate({
        to: "/pull-requests",
        search: {
          involvement: "all",
          state: "all",
          repository: ref.repository,
          number: ref.number,
          ...(ref.host !== undefined ? { selectedHost: ref.host } : {}),
          selectedProjectId: project.id,
          selectedEnvironmentId: project.environmentId,
          ...(tab !== undefined ? { tab } : {}),
          ...(file !== undefined ? { file } : {}),
        },
      });
      return true;
    };
    return {
      openChangeRequest: (ref, options) => open(ref, options?.tab),
      openInCode: ({ changeRequest, path }) => open(changeRequest, "code", path),
    };
  }, [navigate, primaryEnvironmentId, projects, serverConfigs]);
}
