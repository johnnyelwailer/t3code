/**
 * The viewer's open pull requests on every GitHub host gh is signed in to: the ones they wrote and
 * the ones waiting for their review. A host-wide search, not a per-repository listing, so a PR
 * reaches its ticket even when its repository is linked to another project, or to none (IES
 * tickets live in Jira, their code in a dozen `hive/ies-*` repositories).
 *
 * Two consumers read it: the My Work digest (through its PR cache; a host that fails this round
 * is skipped, never the digest) and the `scm.viewer.change-requests` signal source, which also
 * needs to know WHICH hosts failed — a PR missing because its host was unreachable is not a PR
 * that went away. `loadViewerPrRead` carries that; `loadViewerPrEntries` is the entries alone.
 *
 * The reads go over `GitHubApi` (see `t3team-githubViewerSearch.ts`); `gh auth status` only says
 * which hosts the user is signed in to.
 */

import * as Effect from "effect/Effect";

import type * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import type * as VcsProcess from "./vcs/VcsProcess.ts";
import {
  readSignedInGitHubHosts,
  SEARCH_PAGE_SIZE,
  SEARCH_RESULT_CEILING,
  searchHitRepository,
  searchPullRequestsRead,
  viewerLoginFor,
} from "./t3team-githubViewerSearch.ts";
import type { T3TeamDigestProjectSource } from "./t3team-myworkDigestTypes.ts";

type DigestPrEntry = T3TeamDigestProjectSource["prEntries"][number];

type ViewerRole = "author" | "review-requested";

/** One search's answer. `failed`: it did not answer; `truncated`: it answered but hit the limit. */
type SearchRead = {
  readonly entries: DigestPrEntry[];
  readonly failed: boolean;
  readonly truncated: boolean;
};

function searchHost(
  host: string,
  login: string | null,
  role: ViewerRole,
): Effect.Effect<SearchRead, never, GitHubApi.GitHubApi> {
  // Without the login there is nothing to search for: this host is blind, not empty.
  if (login === null) return Effect.succeed({ entries: [], failed: true, truncated: false });
  return searchPullRequestsRead({
    host,
    operation: `t3team.digest.viewerPrs.${role}`,
    query: `is:pr is:open ${role}:${login}`,
    maxPages: SEARCH_RESULT_CEILING / SEARCH_PAGE_SIZE,
  }).pipe(
    Effect.map((read): SearchRead => ({
      failed: read.failed,
      truncated: read.truncated,
      entries: read.items.map((hit) => ({
        host,
        repository: searchHitRepository(hit.repository_url),
        number: hit.number,
        title: hit.title,
        // Search results carry no head branch; the title is where these name their ticket.
        headBranch: "",
        state: "open",
        isDraft: hit.draft ?? false,
        updatedAt: hit.updated_at,
        viewerReviewRequested: role === "review-requested",
        viewerAuthored: role === "author",
        ...(hit.user?.login ? { authorLogin: hit.user.login } : {}),
      })),
    })),
  );
}

/** What one read of the viewer's PRs saw, and which hosts it could not see all of. */
export interface ViewerPrRead {
  readonly entries: DigestPrEntry[];
  /** Hosts gh is signed in to right now. A host that drops out is gone, not empty. */
  readonly signedInHosts: ReadonlyArray<string>;
  /** Hosts whose search failed or was cut off. `"*"` when gh could not even list its hosts. */
  readonly incompleteHosts: ReadonlyArray<string>;
  /** The subset of `incompleteHosts` that answered but hit the limit, so are read in part. */
  readonly truncatedHosts: ReadonlyArray<string>;
}

/** Every signed-in host's open PRs the viewer wrote or is asked to review, each PR once. */
export function loadViewerPrRead(): Effect.Effect<
  ViewerPrRead,
  never,
  GitHubApi.GitHubApi | VcsProcess.VcsProcess
> {
  return Effect.gen(function* () {
    const signedIn = yield* readSignedInGitHubHosts;
    const perHost = yield* Effect.all(
      signedIn.hosts.map((host) =>
        Effect.gen(function* () {
          const login = yield* viewerLoginFor(host);
          const reads = yield* Effect.all(
            (["author", "review-requested"] as const).map((role) => searchHost(host, login, role)),
            { concurrency: 2 },
          );
          return { host, reads };
        }),
      ),
      { concurrency: 4 },
    );
    // A PR both yours and up for your review (a shared branch) is kept once, as yours.
    const byKey = new Map<string, DigestPrEntry>();
    for (const entry of perHost.flatMap(({ reads }) => reads.flatMap((read) => read.entries))) {
      const key = `${entry.host}:${entry.repository}#${entry.number}`;
      if (!byKey.has(key)) byKey.set(key, entry);
    }
    const hostsWhere = (test: (read: SearchRead) => boolean) =>
      new Set(perHost.filter(({ reads }) => reads.some(test)).map(({ host }) => host));
    const failed = hostsWhere((read) => read.failed);
    // A host with one failed search is blind, not merely cut off, whatever its other search did.
    const truncated = [...hostsWhere((read) => read.truncated)].filter((h) => !failed.has(h));
    return {
      entries: [...byKey.values()],
      signedInHosts: signedIn.hosts,
      incompleteHosts: signedIn.ok ? [...new Set([...failed, ...truncated])] : ["*"],
      truncatedHosts: signedIn.ok ? truncated : [],
    };
  });
}

/** The entries alone — what the digest reads. */
export function loadViewerPrEntries(): Effect.Effect<
  DigestPrEntry[],
  never,
  GitHubApi.GitHubApi | VcsProcess.VcsProcess
> {
  return loadViewerPrRead().pipe(Effect.map((read) => read.entries));
}
