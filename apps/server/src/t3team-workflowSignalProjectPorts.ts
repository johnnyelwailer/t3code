/**
 * The project-scope sources' reads, bound to the host's real services: project repositories from
 * the pull-request service, repository search over `GitHubApi` (the viewer source's transport,
 * which owns the rate-limit pause), and the Jira binding + backlog mirror reads, run against the
 * ambient app context the reconciler already narrows for the work-item source.
 */
import { ProjectId } from "@t3tools/contracts";
import type { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { PullRequestService } from "./pullRequest/PullRequestService.ts";
import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import {
  SEARCH_PAGE_SIZE,
  SEARCH_RESULT_CEILING,
  searchPullRequestsRead,
} from "./t3team-githubViewerSearch.ts";
import type { ProjectScopeHostPorts } from "./t3team-workflowSignalCatalogProject.ts";
import {
  keepMirrorWalking,
  readMirrorBaseline,
  readMirrorChangedSince,
  resolveProjectJiraBinding,
} from "./t3team-workflowSignalWorkItemProjectMirror.ts";

/** The services the binding and mirror reads need, all provided by the app composition. */
export type ProjectScopeServices = Effect.Services<
  | ReturnType<typeof resolveProjectJiraBinding>
  | ReturnType<typeof keepMirrorWalking>
  | ReturnType<typeof readMirrorBaseline>
  | ReturnType<typeof readMirrorChangedSince>
>;

/** Runs a binding or mirror read against the ambient app context. */
export type RunAmbient = <A, E>(effect: Effect.Effect<A, E, ProjectScopeServices>) => Promise<A>;

export function makeProjectScopePorts(input: {
  readonly pullRequestService: Pick<PullRequestService["Service"], "projectRepositories">;
  readonly gitHubApi: GitHubApi.GitHubApi["Service"];
  readonly runAmbient: RunAmbient;
  readonly resolveJiraProvider: (
    accountId: string,
  ) => Promise<AtlassianIntegrationProvider | undefined>;
}): ProjectScopeHostPorts {
  const { runAmbient } = input;
  return {
    scmProject: {
      nowIso: () => DateTime.formatIso(DateTime.nowUnsafe()),
      projectRepositories: (projectId) =>
        Effect.runPromise(input.pullRequestService.projectRepositories(ProjectId.make(projectId))),
      search: ({ host, query }) =>
        Effect.runPromise(
          searchPullRequestsRead({
            host,
            operation: "t3team.signal.projectItems",
            query,
            maxPages: SEARCH_RESULT_CEILING / SEARCH_PAGE_SIZE,
          }).pipe(Effect.provideService(GitHubApi.GitHubApi, input.gitHubApi)),
        ),
    },
    workItemProject: {
      resolveBinding: (projectId) => runAmbient(resolveProjectJiraBinding(projectId)),
      keepMirrorWalking: (binding) => runAmbient(keepMirrorWalking(binding)),
      baseline: (binding) => runAmbient(readMirrorBaseline(binding)),
      changedSince: (binding, sinceMs, limit) =>
        runAmbient(readMirrorChangedSince(binding, sinceMs, limit)),
      filterByJql: async (binding, jql, issueKeys) => {
        const provider = await input.resolveJiraProvider(binding.accountId);
        if (provider === undefined) throw new Error("No usable Jira session for the JQL scope.");
        return provider.filterIssueKeysByJql({ accountId: binding.accountId, jql, issueKeys });
      },
    },
  };
}
