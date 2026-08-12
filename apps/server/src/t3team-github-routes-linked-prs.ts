import * as Effect from "effect/Effect";
import { resolveGitHubWorkItemKey } from "@t3tools/shared/t3team-githubActivity";
import type { VcsProcessShape } from "./t3team-vcsProcessShape.ts";
import { parseLinkedRepositoryName } from "./t3team-github-routes-suggestions.ts";
import type {
  GitHubInboxAttempt,
  GitHubInboxItem,
  RawGitHubPullRequest,
} from "./t3team-github-routes-shared.ts";
import { parseJsonArray, readTrimmedString } from "./t3team-github-routes-shared.ts";
import { normalizeRepositoryUrls } from "./t3team-project-repository-utils.ts";

export function loadLinkedPullRequestsAttempt(input: {
  readonly vcs: VcsProcessShape;
  readonly host: string;
  readonly account?: string;
  readonly linkedRepositoryUrls?: ReadonlyArray<string>;
}): Effect.Effect<GitHubInboxAttempt, never, never> {
  const repositoryNames = normalizeRepositoryUrls(input.linkedRepositoryUrls)
    .map((url) => parseLinkedRepositoryName(input.host, url))
    .filter((value): value is string => typeof value === "string");

  if (repositoryNames.length === 0) return Effect.succeed({ items: [] });

  type RepositoryResult = {
    readonly repository: string;
    readonly items: ReadonlyArray<GitHubInboxItem>;
    readonly failed: boolean;
  };

  return Effect.forEach(
    repositoryNames,
    (repository): Effect.Effect<RepositoryResult, never, never> =>
      input.vcs
        .run({
          operation: "t3team.github.repo-prs",
          command: "gh",
          args: [
            "api",
            "--hostname",
            input.host,
            `/repos/${repository}/pulls?state=all&per_page=30&sort=updated&direction=desc`,
          ],
          cwd: process.cwd(),
        })
        .pipe(
          Effect.map((output) => parseJsonArray<RawGitHubPullRequest>(output.stdout, [])),
          Effect.map((pullRequests) =>
            pullRequests.map((pullRequest) => {
              const subjectUrl = readTrimmedString(pullRequest.html_url);
              const subjectTitle = readTrimmedString(pullRequest.title);
              const subjectBranch = readTrimmedString(pullRequest.head?.ref);
              const authorLogin = readTrimmedString(pullRequest.user?.login);
              const authorAvatarUrl = readTrimmedString(pullRequest.user?.avatar_url);
              const updatedAt = readTrimmedString(pullRequest.updated_at);
              const state = readTrimmedString(pullRequest.state)?.toLowerCase();
              const requestedReviewerLogins = (pullRequest.requested_reviewers ?? [])
                .map((reviewer) => readTrimmedString(reviewer.login)?.toLowerCase())
                .filter((value): value is string => typeof value === "string");
              const reviewRequested =
                typeof input.account === "string" &&
                requestedReviewerLogins.includes(input.account.toLowerCase());
              const subjectState = pullRequest.merged_at
                ? "merged"
                : pullRequest.draft
                  ? "draft"
                  : state === "closed"
                    ? "closed"
                    : "open";
              const number =
                typeof pullRequest.number === "number"
                  ? String(pullRequest.number)
                  : readTrimmedString(pullRequest.id)?.toString();
              // Stamp the work-item association server-side, so a response already carries it
              // for callers with no browser to run `toGitHubWorkActivityItems` in (a headless
              // orchestration run, a scheduled job, an agent). Same precedence, same function the
              // web app uses — see `@t3tools/shared/t3team-githubActivity`.
              const workItemKey = resolveGitHubWorkItemKey({
                ...(subjectTitle ? { subjectTitle } : {}),
                ...(subjectBranch ? { subjectBranch } : {}),
                repository,
              });
              const inboxItem: GitHubInboxItem = {
                id: number
                  ? `pr:${repository}:${number}`
                  : `pr:${repository}:${subjectTitle ?? "unknown"}`,
                repository,
                repositoryUrl: `https://${input.host}/${repository}`,
                reason: "pull request",
                ...(authorLogin ? { authorLogin } : {}),
                ...(authorAvatarUrl ? { authorAvatarUrl } : {}),
                ...(reviewRequested ? { reviewRequested } : {}),
                subjectType: "PullRequest",
                ...(subjectTitle ? { subjectTitle } : {}),
                ...(subjectUrl ? { subjectUrl } : {}),
                ...(subjectBranch ? { subjectBranch } : {}),
                ...(typeof pullRequest.comments === "number"
                  ? { commentCount: pullRequest.comments }
                  : {}),
                ...(typeof pullRequest.review_comments === "number"
                  ? { reviewCommentCount: pullRequest.review_comments }
                  : {}),
                ...(typeof pullRequest.additions === "number"
                  ? { additions: pullRequest.additions }
                  : {}),
                ...(typeof pullRequest.deletions === "number"
                  ? { deletions: pullRequest.deletions }
                  : {}),
                ...(typeof pullRequest.changed_files === "number"
                  ? { changedFiles: pullRequest.changed_files }
                  : {}),
                ...(updatedAt ? { updatedAt } : {}),
                subjectState,
                ...(workItemKey ? { workItemKey } : {}),
              };
              return inboxItem;
            }),
          ),
          Effect.match({
            onFailure: () => ({ repository, items: [], failed: true }) satisfies RepositoryResult,
            onSuccess: (items) => ({ repository, items, failed: false }) satisfies RepositoryResult,
          }),
        ),
    { concurrency: 3 },
  ).pipe(
    Effect.map((results) => {
      const items = results.flatMap((result) => result.items);
      const failedRepositories = results
        .filter((result) => result.failed)
        .map((result) => result.repository);
      const warning =
        failedRepositories.length > 0
          ? `Unable to load pull requests for ${failedRepositories.join(", ")} (check host, permissions, or API availability).`
          : undefined;
      return { items, ...(warning ? { warning } : {}) } satisfies GitHubInboxAttempt;
    }),
  );
}
