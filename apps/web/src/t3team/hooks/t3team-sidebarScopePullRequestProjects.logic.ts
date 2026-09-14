import type { ScopedProjectRef } from "@t3tools/contracts";

export type SidebarScopePullRequestProject = {
  readonly id: string;
  readonly environmentId: string;
  readonly repositoryIdentity?: { readonly canonicalKey?: string | undefined } | null | undefined;
};

export type SidebarScopePullRequestSelection = {
  /** `environmentId:projectId` keys of every project whose pull requests belong to the scope. */
  readonly projectKeys: ReadonlySet<string>;
  /** The same selection grouped for `PullRequestListInput.projectIds`, by environment. */
  readonly projectIdsByEnvironment: ReadonlyMap<string, ReadonlyArray<string>>;
};

export function scopedProjectKey(ref: { environmentId: string; projectId: string }): string {
  return `${ref.environmentId}:${ref.projectId}`;
}

/**
 * Which projects the pull request list should read when the sidebar scope is on.
 *
 * A git-workspace scope is its member projects. A work-source (Jira) project additionally pulls
 * in every workspace project whose git remote is one of the repositories it links — only those
 * can be listed at all, since upstream's listing is keyed by project rather than by repository.
 * Linked repositories with no workspace project are silently absent: there is nothing to ask.
 */
export function resolveSidebarScopePullRequestProjects(input: {
  readonly scopedProjectRefs: ReadonlyArray<ScopedProjectRef>;
  readonly projects: ReadonlyArray<SidebarScopePullRequestProject>;
  readonly linkedRepositoryKeysByProjectId: ReadonlyMap<string, ReadonlyArray<string>>;
}): SidebarScopePullRequestSelection {
  const linkedKeys = new Set<string>();
  for (const ref of input.scopedProjectRefs) {
    for (const key of input.linkedRepositoryKeysByProjectId.get(ref.projectId) ?? []) {
      linkedKeys.add(key.toLowerCase());
    }
  }
  const projectKeys = new Set(input.scopedProjectRefs.map(scopedProjectKey));
  for (const project of input.projects) {
    const remote = project.repositoryIdentity?.canonicalKey?.toLowerCase();
    if (remote !== undefined && linkedKeys.has(remote)) {
      projectKeys.add(
        scopedProjectKey({ environmentId: project.environmentId, projectId: project.id }),
      );
    }
  }
  const projectIdsByEnvironment = new Map<string, string[]>();
  for (const project of input.projects) {
    if (
      !projectKeys.has(
        scopedProjectKey({ environmentId: project.environmentId, projectId: project.id }),
      )
    ) {
      continue;
    }
    const ids = projectIdsByEnvironment.get(project.environmentId);
    if (ids) ids.push(project.id);
    else projectIdsByEnvironment.set(project.environmentId, [project.id]);
  }
  return { projectKeys, projectIdsByEnvironment };
}
