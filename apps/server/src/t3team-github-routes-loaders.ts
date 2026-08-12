import * as Effect from "effect/Effect";
import { resolveGitHubWorkItemKey } from "@t3tools/shared/t3team-githubActivity";
import type { VcsProcessShape } from "./t3team-vcsProcessShape.ts";
import { enrichPullRequestState } from "./t3team-github-routes-pr.ts";
import type {
  GitHubInboxAttempt,
  GitHubInboxItem,
  GitHubRepositoryCandidate,
  GitHubRepositoriesAttempt,
  RawGitHubNotification,
  RawGitHubRepo,
} from "./t3team-github-routes-shared.ts";
import { parseJsonArray, readTrimmedString } from "./t3team-github-routes-shared.ts";
import { collectProjectSearchTerms } from "./t3team-github-routes-suggestions.ts";

function mapRawRepositories(
  host: string,
  items: ReadonlyArray<RawGitHubRepo>,
): ReadonlyArray<GitHubRepositoryCandidate> {
  return items
    .map((item) => {
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
    .filter((value): value is NonNullable<typeof value> => value !== undefined)
    .toSorted((left, right) => left.nameWithOwner.localeCompare(right.nameWithOwner));
}

export function loadRepositoriesAttempt(
  vcs: VcsProcessShape,
  host: string,
): Effect.Effect<GitHubRepositoriesAttempt, never, never> {
  return vcs
    .run({
      operation: "t3team.github.repositories",
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
      Effect.map((items) => mapRawRepositories(host, items)),
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

/** Fast path for project setup: search repository names instead of listing every accessible repo. */
export function loadRepositorySearchAttempt(
  vcs: VcsProcessShape,
  host: string,
  input: { readonly projectKey?: string; readonly projectTitle?: string },
): Effect.Effect<GitHubRepositoriesAttempt, never, never> {
  const terms = collectProjectSearchTerms(input).slice(0, 4);
  if (terms.length === 0) return Effect.succeed({ items: [] });

  const query = terms.map((term) => `"${term}" in:name`).join(" OR ");
  return vcs
    .run({
      operation: "t3team.github.repository-search",
      command: "gh",
      args: [
        "api",
        "--hostname",
        host,
        `/search/repositories?q=${encodeURIComponent(query)}&per_page=100`,
      ],
      cwd: process.cwd(),
    })
    .pipe(
      Effect.map((output) => {
        try {
          const parsed = JSON.parse(output.stdout) as { readonly items?: unknown };
          return Array.isArray(parsed.items) ? parsed.items : [];
        } catch {
          return [];
        }
      }),
      Effect.map((items) => mapRawRepositories(host, items as ReadonlyArray<RawGitHubRepo>)),
      Effect.map((items) => ({ items })),
      Effect.match({
        onFailure: () => ({
          items: [] as ReadonlyArray<GitHubRepositoryCandidate>,
          warning: "Unable to search repositories for this host (check API permissions).",
        }),
        onSuccess: (value) => value,
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
      operation: "t3team.github.inbox",
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
            // Stamped here as well as in `loadLinkedPullRequestsAttempt`, because these are the
            // only two producers of `GitHubInboxItem` and a caller with no browser cannot tell
            // which path an item came from. Stamping one and not the other would make the field
            // silently unreliable — worse than absent. A notification carries no head branch, so
            // the precedence chain resolves from title, then repository name.
            const workItemKey = resolveGitHubWorkItemKey({
              ...(subjectTitle ? { subjectTitle } : {}),
              repository,
            });
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
              ...(workItemKey ? { workItemKey } : {}),
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
