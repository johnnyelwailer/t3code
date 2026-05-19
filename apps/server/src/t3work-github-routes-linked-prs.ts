import * as Effect from "effect/Effect";
import type { VcsProcessShape } from "./vcs/VcsProcess.ts";
import { parseLinkedRepositoryName } from "./t3work-github-routes-suggestions.ts";
import type {
  GitHubInboxAttempt,
  GitHubInboxItem,
  RawGitHubPullRequest,
} from "./t3work-github-routes-shared.ts";
import { parseJsonArray, readTrimmedString } from "./t3work-github-routes-shared.ts";
import { normalizeRepositoryUrls } from "./t3work-project-repository-utils.ts";

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

  return Effect.forEach(
    repositoryNames,
    (repository) =>
      input.vcs
        .run({
          operation: "t3work.github.repo-prs",
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
              };
              return inboxItem;
            }),
          ),
          Effect.catch(() => Effect.succeed([] as ReadonlyArray<GitHubInboxItem>)),
        ),
    { concurrency: 3 },
  ).pipe(
    Effect.map((allItems) => allItems.flat()),
    Effect.map((items) => ({ items }) satisfies GitHubInboxAttempt),
  );
}
