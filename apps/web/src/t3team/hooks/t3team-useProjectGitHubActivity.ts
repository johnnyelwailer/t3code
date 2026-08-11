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
 * TODO(narrowing, tracked in PR body): `linkedRepositoryUrls` is accepted but unused. The old
 * inbox source could scope itself to more than one repository per project;
 * `PullRequestListInput` (packages/contracts/src/pullRequest.ts) has no `repository` field at
 * all — only `projectId`/`host`/`query` — so there is no way to ask upstream's listing for a
 * second repository's rows without adding that field and its provider plumbing server-side.
 * That is new server surface, out of scope here: a project's *own* repository still matches
 * fully, but a ticket linked only through a second repository on the same project will not
 * surface here until that surface exists. Kept in the signature so every call site needs no
 * change once it does.
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed by data identity only
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
