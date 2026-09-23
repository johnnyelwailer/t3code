import { useMemo } from "react";
import type { ProjectId } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import { usePrimaryEnvironment } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { pullRequestEnvironment } from "~/state/pullRequests";
import {
  groupGitHubActivityByWorkItem,
  type GitHubWorkActivityItem,
} from "~/t3team/t3team-githubActivity";
import { toGitHubWorkActivityItemsFromPullRequestEntries } from "~/t3team/t3team-githubActivityFromPullRequests";

type UseProjectGitHubActivityOptions = {
  readonly project: ProjectShellProject;
  readonly linkedRepositoryUrls: ReadonlyArray<string>;
  readonly enabled?: boolean;
};

/**
 * Ticket↔PR matching used to poll the fork's own GitHub inbox notifications
 * (`backend.github.pollInbox`) for this project's linked repositories. It now reads upstream's
 * `pullRequestEnvironment.list` atom instead — the same one `routes/_chat.pull-requests.tsx`
 * reads for the full pull request list — scoped to this project rather than to a set of linked
 * repository URLs, since upstream's listing is keyed by project rather than by repository.
 *
 * `linkedRepositoryUrls` is accepted but unused, kept so every call site needs no change:
 * the server now resolves a project's linked repositories itself when answering `list`
 * (from its `.t3team/context/linked-repositories.json`), so the project-scoped listing
 * already carries the rows of its linked repositories and there is nothing to narrow here.
 */
export function useProjectGitHubActivity({
  project,
  enabled = true,
}: UseProjectGitHubActivityOptions) {
  const projectId = project.id as unknown as ProjectId;
  const primaryEnvironment = usePrimaryEnvironment();
  const pullRequestsSupported =
    primaryEnvironment?.serverConfig?.environment.capabilities.pullRequests === true;
  const environmentId =
    enabled && pullRequestsSupported ? primaryEnvironment?.environmentId : undefined;

  const listQuery = useEnvironmentQuery(
    environmentId === undefined
      ? null
      : pullRequestEnvironment.list({
          environmentId,
          input: { state: "all", projectId, limit: 99 },
        }),
  );

  const activityItems = useMemo<ReadonlyArray<GitHubWorkActivityItem>>(
    () => toGitHubWorkActivityItemsFromPullRequestEntries(listQuery.data?.entries ?? []),
    [listQuery.data],
  );

  const host = useMemo(() => {
    const first = listQuery.data?.entries[0];
    return first?.host ?? "github.com";
  }, [listQuery.data]);
  const account = useMemo(
    () => (listQuery.data ? Object.values(listQuery.data.viewers)[0] : undefined),
    [listQuery.data],
  );
  const listError = listQuery.data?.errors.find((error) => error.projectId === projectId);
  // Recomputed only when the answer itself changes, not on every render, so this reads as "the
  // moment this list last landed" rather than drifting forward on every unrelated re-render.
  const lastCheckedAt = useMemo(() => (listQuery.data ? Date.now() : undefined), [listQuery.data]);

  const activityByWorkItem = useMemo(
    () => groupGitHubActivityByWorkItem(activityItems),
    [activityItems],
  );

  const unlinkedActivityItems = useMemo(
    () => activityItems.filter((item) => !item.workItemKey),
    [activityItems],
  );

  return {
    loading: listQuery.isPending && listQuery.data === null,
    host,
    account,
    warning: listQuery.error ?? listError?.message,
    // Repository suggestions are a discovery-flow concept upstream has no listing counterpart
    // for; `useGitHubRepositoryDiscovery` still owns that surface.
    suggestedRepositoryCount: 0,
    activityItems,
    activityByWorkItem,
    unlinkedActivityItems,
    lastCheckedAt,
  };
}
