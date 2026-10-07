/**
 * The viewer's pull requests merged inside a time window, on every GitHub host gh is signed in
 * to — the sibling of `t3team-myworkDigestViewerPrs.ts`'s open-PR search, with the same host-wide
 * reach (a merge reaches its ticket whichever repository it landed in) and the same failure rule:
 * a host that fails this round is skipped, never the digest.
 *
 * GitHub's `merged:` qualifier takes a date, not an instant, so the query is padded by a day on
 * each side (the date is read in UTC, the window in the viewer's zone) and the exact window
 * filters. A hit's merge time is `pull_request.merged_at`, falling back to `closed_at`, which is
 * the same instant for a merged pull request.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type * as GitHubApi from "./sourceControl/GitHubApi.ts";
import type * as VcsProcess from "./vcs/VcsProcess.ts";
import {
  searchHitMergedAt,
  searchHitRepository,
  searchPullRequests,
  signedInGitHubHosts,
  viewerLoginFor,
} from "./t3team-githubViewerSearch.ts";
import type { DigestYesterdayWindow } from "./t3team-myworkDigestYesterdayWindow.ts";
import type { T3TeamDigestProjectSource } from "./t3team-myworkDigestTypes.ts";

type DigestPrEntry = T3TeamDigestProjectSource["prEntries"][number];

const DAY_MS = 24 * 60 * 60 * 1000;

const utcDate = (ms: number): string => DateTime.formatIso(DateTime.makeUnsafe(ms)).slice(0, 10);

/** The query one host answers: mine, merged, from a day before the window's UTC date. */
export function mergedPrSearchQuery(login: string, window: DigestYesterdayWindow): string {
  return `is:pr is:merged author:${login} merged:>=${utcDate(window.fromMs - DAY_MS)}`;
}

function searchHost(
  host: string,
  login: string,
  window: DigestYesterdayWindow,
): Effect.Effect<DigestPrEntry[], never, GitHubApi.GitHubApi> {
  return searchPullRequests({
    host,
    operation: "t3team.digest.mergedPrs",
    query: mergedPrSearchQuery(login, window),
  }).pipe(
    Effect.map((hits) =>
      hits.flatMap((hit) => {
        const mergedAt = searchHitMergedAt(hit);
        if (mergedAt === null) return [];
        const mergedMs = Date.parse(mergedAt);
        if (!(mergedMs >= window.fromMs && mergedMs < window.untilMs)) return [];
        return [
          {
            host,
            repository: searchHitRepository(hit.repository_url),
            number: hit.number,
            title: hit.title,
            headBranch: "",
            state: "merged",
            isDraft: false,
            // The merge time: what the "Merged" rows show and sort by.
            updatedAt: mergedAt,
            viewerReviewRequested: false,
            viewerAuthored: true,
          } satisfies DigestPrEntry,
        ];
      }),
    ),
  );
}

/** Every signed-in host's PRs the viewer merged inside `window`, newest first. */
export function loadViewerMergedPrEntries(
  window: DigestYesterdayWindow,
): Effect.Effect<DigestPrEntry[], never, GitHubApi.GitHubApi | VcsProcess.VcsProcess> {
  return Effect.gen(function* () {
    const hosts = yield* signedInGitHubHosts;
    const perHost = yield* Effect.all(
      hosts.map((host) =>
        Effect.gen(function* () {
          const login = yield* viewerLoginFor(host);
          return login === null ? [] : yield* searchHost(host, login, window);
        }),
      ),
      { concurrency: 4 },
    );
    return perHost.flat().toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  });
}
