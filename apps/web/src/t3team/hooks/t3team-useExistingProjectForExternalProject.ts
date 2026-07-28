import { useMemo } from "react";

import { useProjects } from "~/state/entities";

export interface ExistingProjectMatch {
  readonly projectId: string;
  readonly title: string;
}

/**
 * Detects, at SELECTION time, which external (Jira/Linear/GitHub) projects the wizard is listing
 * already have a live project bound to them — so the wizard can offer "Open project" instead of
 * letting the user walk the whole flow into the `project.create` duplicate invariant at the end
 * (Defect 3).
 *
 * Matches on `(provider, accountId, externalProjectId)` over the live shell snapshot
 * (`useProjects()`), which now carries each project's real `source` binding. A `local` project, or
 * one bound to a different account, is never a match.
 */
export function useExistingProjectForExternalProject(input: {
  accountId: string | null;
  externalProjectIds: ReadonlyArray<string>;
}): ReadonlyMap<string, ExistingProjectMatch> {
  const { accountId, externalProjectIds } = input;
  const liveProjects = useProjects();

  return useMemo(() => {
    const result = new Map<string, ExistingProjectMatch>();
    if (!accountId || externalProjectIds.length === 0) {
      return result;
    }

    const wanted = new Set(externalProjectIds);
    for (const project of liveProjects) {
      const source = project.source;
      if (!source || source.provider === "local") continue;
      if (source.accountId !== accountId) continue;
      if (!wanted.has(source.externalProjectId)) continue;
      result.set(source.externalProjectId, { projectId: project.id, title: project.title });
    }
    return result;
  }, [liveProjects, accountId, externalProjectIds]);
}
