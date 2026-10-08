/**
 * The viewer's open pull requests on every GitHub host gh is signed in to: the ones they wrote and
 * the ones waiting for their review. A host-wide search, not a per-repository listing, so a PR
 * reaches its ticket even when its repository is linked to another project, or to none (IES
 * tickets live in Jira, their code in a dozen `hive/ies-*` repositories).
 *
 * Read through the digest's PR cache (`t3team-myworkDigestPrCache.ts`): one read serves every
 * project, and a host that fails this round is skipped, never the digest.
 */

import * as Effect from "effect/Effect";

import type * as GitHubApi from "./sourceControl/GitHubApi.ts";
import type * as VcsProcess from "./vcs/VcsProcess.ts";
import {
  searchHitRepository,
  searchPullRequests,
  signedInGitHubHosts,
  viewerLoginFor,
} from "./t3team-githubViewerSearch.ts";
import type { T3TeamDigestProjectSource } from "./t3team-myworkDigestTypes.ts";

type DigestPrEntry = T3TeamDigestProjectSource["prEntries"][number];

type ViewerRole = "author" | "review-requested";

function searchHost(
  host: string,
  login: string,
  role: ViewerRole,
): Effect.Effect<DigestPrEntry[], never, GitHubApi.GitHubApi> {
  return searchPullRequests({
    host,
    operation: `t3team.digest.viewerPrs.${role}`,
    query: `is:pr is:open ${role}:${login}`,
  }).pipe(
    Effect.map((hits) =>
      hits.map((hit) => ({
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
    ),
  );
}

/** Every signed-in host's open PRs the viewer wrote or is asked to review, each PR once. */
export function loadViewerPrEntries(): Effect.Effect<
  DigestPrEntry[],
  never,
  GitHubApi.GitHubApi | VcsProcess.VcsProcess
> {
  return Effect.gen(function* () {
    const hosts = yield* signedInGitHubHosts;
    const perHost = yield* Effect.all(
      hosts.map((host) =>
        Effect.gen(function* () {
          // Without the login there is nothing to search for, so the host sits this round out.
          const login = yield* viewerLoginFor(host);
          if (login === null) return [] as DigestPrEntry[];
          const roles = yield* Effect.all(
            (["author", "review-requested"] as const).map((role) => searchHost(host, login, role)),
            { concurrency: 2 },
          );
          return roles.flat();
        }),
      ),
      { concurrency: 4 },
    );
    // A PR both yours and up for your review (a shared branch) is kept once, as yours.
    const byKey = new Map<string, DigestPrEntry>();
    for (const entry of perHost.flat()) {
      const key = `${entry.host}:${entry.repository}#${entry.number}`;
      if (!byKey.has(key)) byKey.set(key, entry);
    }
    return [...byKey.values()];
  });
}

const KEY_IN_TITLE = /(?:^|[^A-Za-z0-9])([A-Z][A-Z0-9]+)-\d+/g;

/**
 * This project's share of the viewer's PRs: the ones whose title names an issue in one of the
 * project's Jira keys (`IES-…`), whoever's ticket it is — a colleague's ticket up for review
 * belongs here as much as the viewer's own. PRs the project's repository listing already carries
 * stay as that listing has them (it knows the head branch and checks).
 */
export function viewerPrsForProject(input: {
  readonly viewerEntries: ReadonlyArray<DigestPrEntry>;
  readonly projectEntries: ReadonlyArray<DigestPrEntry>;
  readonly ticketDisplayIds: ReadonlyArray<string | undefined>;
}): DigestPrEntry[] {
  const prefixes = new Set(
    input.ticketDisplayIds.flatMap((id) => {
      const prefix = id?.match(/^([A-Z][A-Z0-9]+)-\d+$/i)?.[1];
      return prefix ? [prefix.toUpperCase()] : [];
    }),
  );
  const listed = new Set(input.projectEntries.map((e) => `${e.host}:${e.repository}#${e.number}`));
  const own = input.projectEntries.map((entry) => {
    const viewer = input.viewerEntries.find(
      (v) =>
        v.host === entry.host && v.repository === entry.repository && v.number === entry.number,
    );
    return viewer?.viewerAuthored ? { ...entry, viewerAuthored: true } : entry;
  });
  const extra = input.viewerEntries.filter(
    (entry) =>
      !listed.has(`${entry.host}:${entry.repository}#${entry.number}`) &&
      [...entry.title.toUpperCase().matchAll(KEY_IN_TITLE)].some((m) => prefixes.has(m[1]!)),
  );
  return [...own, ...extra];
}
