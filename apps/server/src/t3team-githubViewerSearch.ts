/**
 * The host-wide GitHub reads the My Work digest makes, over the server's GitHub API transport.
 *
 * `gh auth status` stays the record of WHICH hosts the user is signed in to — it is the only one
 * there is — but every read after that goes through `GitHubApi`, which owns the credential, the
 * rate-limit pause and the API base URL for GitHub Enterprise hosts. Nothing here fails: a host
 * that cannot be read this round contributes nothing, so one bad host never fails the digest.
 */

import * as NodeOS from "node:os";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as GitHubApi from "@t3tools/source-control-github/server/GitHubApi";
import {
  findAuthenticatedGitHubAccounts,
  parseGitHubAuthStatus,
} from "@t3tools/source-control-github/server/gitHubAuthStatus";
import * as VcsProcess from "./vcs/VcsProcess.ts";

/** GitHub's search page cap; a digest round reads one page and never pages past it. */
export const SEARCH_PAGE_SIZE = 100;

const GitHubSearchItem = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  /** `https://<api root>/repos/<owner>/<name>`; the only place a hit names its repository. */
  repository_url: Schema.String,
  updated_at: Schema.String,
  closed_at: Schema.optional(Schema.NullOr(Schema.String)),
  draft: Schema.optional(Schema.Boolean),
  user: Schema.optional(Schema.NullOr(Schema.Struct({ login: Schema.String }))),
  pull_request: Schema.optional(
    Schema.NullOr(Schema.Struct({ merged_at: Schema.optional(Schema.NullOr(Schema.String)) })),
  ),
});
export type GitHubSearchItem = typeof GitHubSearchItem.Type;

const decodeSearch = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ items: Schema.Array(GitHubSearchItem) })),
);
const decodeViewer = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ login: Schema.String })),
);

/** `owner/name` out of a search hit's `repository_url`. */
export function searchHitRepository(repositoryUrl: string): string {
  return repositoryUrl.split("/").filter(Boolean).slice(-2).join("/");
}

/** The merge instant of a merged hit; `closed_at` is what GitHub fills for an older answer. */
export function searchHitMergedAt(item: GitHubSearchItem): string | null {
  return item.pull_request?.merged_at ?? item.closed_at ?? null;
}

/**
 * Every GitHub host `gh` holds an authenticated login for. Read from the CLI on each call: a
 * `gh auth login` or `gh auth logout` between rounds must apply on the next one. `ok` is false
 * when `gh` could not say, which is not the same as "no hosts".
 */
export const readSignedInGitHubHosts: Effect.Effect<
  { readonly hosts: ReadonlyArray<string>; readonly ok: boolean },
  never,
  VcsProcess.VcsProcess
> = Effect.gen(function* () {
  const process = yield* VcsProcess.VcsProcess;
  const output = yield* process
    .run({
      operation: "t3team.digest.githubHosts",
      command: "gh",
      args: ["auth", "status", "--json", "hosts"],
      cwd: NodeOS.homedir(),
      timeoutMs: 15_000,
    })
    .pipe(Effect.option);
  if (Option.isNone(output)) return { hosts: [], ok: false };
  const status = parseGitHubAuthStatus(output.value.stdout);
  return {
    hosts: [...new Set(findAuthenticatedGitHubAccounts(status.accounts).map((a) => a.host))],
    ok: status.parsed,
  };
});

export const signedInGitHubHosts: Effect.Effect<
  ReadonlyArray<string>,
  never,
  VcsProcess.VcsProcess
> = readSignedInGitHubHosts.pipe(Effect.map(({ hosts }) => hosts));

/**
 * The login the server's credential for a host belongs to. GitHub's search API has no `@me`, so
 * every `author:`/`review-requested:` query needs it spelled out. Remembered for the server's
 * lifetime: a login does not change under a credential, and this runs on every digest round.
 */
const viewerLogins = new Map<string, string>();

export function viewerLoginFor(
  host: string,
): Effect.Effect<string | null, never, GitHubApi.GitHubApi> {
  return Effect.gen(function* () {
    const known = viewerLogins.get(host);
    if (known !== undefined) return known;
    const api = yield* GitHubApi.GitHubApi;
    const result = yield* api
      .rest({ host, operation: "t3team.digest.viewer", path: "user" })
      .pipe(Effect.option);
    if (Option.isNone(result)) return null;
    const decoded = decodeViewer(result.value.body);
    if (Option.isNone(decoded) || decoded.value.login.trim() === "") return null;
    viewerLogins.set(host, decoded.value.login);
    return decoded.value.login;
  });
}

/** GitHub's search API stops answering past this many hits for one query. */
export const SEARCH_RESULT_CEILING = 1000;

/** What a search saw: `failed` — a page did not answer; `truncated` — it ran into the ceiling. */
export interface SearchPullRequestsRead {
  readonly items: ReadonlyArray<GitHubSearchItem>;
  readonly failed: boolean;
  readonly truncated: boolean;
}

/**
 * `GET /search/issues`, following pages while they come back full, up to `maxPages`. An unreadable
 * or refused page ends the read with `failed` set; the hits already read are still returned.
 */
export function searchPullRequestsRead(input: {
  readonly host: string;
  readonly operation: string;
  readonly query: string;
  readonly maxPages?: number;
}): Effect.Effect<SearchPullRequestsRead, never, GitHubApi.GitHubApi> {
  const maxPages = input.maxPages ?? 1;
  return Effect.gen(function* () {
    const api = yield* GitHubApi.GitHubApi;
    const items: Array<GitHubSearchItem> = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const result = yield* api
        .rest({
          host: input.host,
          operation: input.operation,
          path: `search/issues?q=${encodeURIComponent(input.query)}&per_page=${SEARCH_PAGE_SIZE}&page=${page}`,
        })
        .pipe(Effect.option);
      const decoded = Option.isNone(result) ? Option.none() : decodeSearch(result.value.body);
      if (Option.isNone(decoded)) return { items, failed: true, truncated: false };
      items.push(...decoded.value.items);
      if (decoded.value.items.length < SEARCH_PAGE_SIZE) break;
    }
    return { items, failed: false, truncated: items.length >= SEARCH_RESULT_CEILING };
  });
}

/** One page of `GET /search/issues`; an unreadable or refused answer is no hits, not a failure. */
export function searchPullRequests(input: {
  readonly host: string;
  readonly operation: string;
  readonly query: string;
}): Effect.Effect<ReadonlyArray<GitHubSearchItem>, never, GitHubApi.GitHubApi> {
  return searchPullRequestsRead(input).pipe(Effect.map((read) => read.items));
}

export function resetDigestViewerLoginsForTests(): void {
  viewerLogins.clear();
}
