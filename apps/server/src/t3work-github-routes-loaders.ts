import * as Effect from "effect/Effect";
import type { VcsProcessShape } from "./t3work-vcsProcessShape.ts";
import { enrichPullRequestState } from "./t3work-github-routes-pr.ts";
import type {
  GitHubInboxAttempt,
  GitHubInboxItem,
  GitHubRepositoryCandidate,
  GitHubRepositoriesAttempt,
  RawGitHubNotification,
  RawGitHubRepo,
} from "./t3work-github-routes-shared.ts";
import { parseJsonArray, readTrimmedString } from "./t3work-github-routes-shared.ts";

export function loadRepositoriesAttempt(
  vcs: VcsProcessShape,
  host: string,
): Effect.Effect<GitHubRepositoriesAttempt, never, never> {
  return vcs
    .run({
      operation: "t3work.github.repositories",
      command: "gh",
      args: [
        "api",
        "--hostname",
        host,
        "--paginate",
        "/user/repos?per_page=100&affiliation=owner,collaborator,organization_member",
      ],
      cwd: process.cwd(),
    })
    .pipe(
      Effect.map((output) => parseJsonArray<RawGitHubRepo>(output.stdout, [])),
      Effect.map((items) =>
        items
          .map((item: RawGitHubRepo) => {
            const nameWithOwner = readTrimmedString(item.full_name);
            const url = readTrimmedString(item.html_url);
            const updatedAt = readTrimmedString(item.updated_at);
            const description = readTrimmedString(item.description);
            if (!nameWithOwner || !url) return undefined;
            return {
              id: String(item.id ?? `${host}:${nameWithOwner}`),
              nameWithOwner,
              url,
              host,
              ...(updatedAt ? { updatedAt } : {}),
              ...(description ? { description } : {}),
              ...(typeof item.private === "boolean" ? { isPrivate: item.private } : {}),
            };
          })
          .filter((value): value is NonNullable<typeof value> => value !== undefined),
      ),
      Effect.map((items) =>
        items.toSorted((left, right) => left.nameWithOwner.localeCompare(right.nameWithOwner)),
      ),
      Effect.match({
        onFailure: () => ({
          items: [] as ReadonlyArray<GitHubRepositoryCandidate>,
          warning:
            "Unable to list repositories for this host (check host, permissions, or API availability).",
        }),
        onSuccess: (items) => ({ items }),
      }),
    );
}

export function loadInboxAttempt(
  vcs: VcsProcessShape,
  host: string,
  account?: string,
): Effect.Effect<GitHubInboxAttempt, never, never> {
  return vcs
    .run({
      operation: "t3work.github.inbox",
      command: "gh",
      args: ["api", "--hostname", host, "/notifications?per_page=25"],
      cwd: process.cwd(),
    })
    .pipe(
      Effect.map((output) => parseJsonArray<RawGitHubNotification>(output.stdout, [])),
      Effect.map((items) =>
        items
          .map((item: RawGitHubNotification) => {
            const id = readTrimmedString(item.id);
            const repository = readTrimmedString(item.repository?.full_name);
            const reason = readTrimmedString(item.reason);
            const subjectType = readTrimmedString(item.subject?.type);
            const subjectTitle = readTrimmedString(item.subject?.title);
            const subjectApiUrl = readTrimmedString(item.subject?.url);
            const updatedAt = readTrimmedString(item.updated_at);
            if (!id || !repository || !reason) return undefined;
            const inboxItem: GitHubInboxItem = {
              id,
              repository,
              repositoryUrl: `https://${host}/${repository}`,
              reason,
              ...(reason.toLowerCase() === "review_requested" ? { reviewRequested: true } : {}),
              ...(subjectType ? { subjectType } : {}),
              ...(subjectTitle ? { subjectTitle } : {}),
              ...(subjectApiUrl ? { subjectUrl: subjectApiUrl } : {}),
              ...(updatedAt ? { updatedAt } : {}),
            };
            return inboxItem;
          })
          .filter((value): value is GitHubInboxItem => value !== undefined),
      ),
      Effect.flatMap((items) => enrichPullRequestState(vcs, host, items, account)),
      Effect.match({
        onFailure: () => ({
          items: [] as ReadonlyArray<GitHubInboxItem>,
          warning: "Unable to load GitHub inbox (notifications scope may be missing).",
        }),
        onSuccess: (items) => ({ items }),
      }),
    );
}
