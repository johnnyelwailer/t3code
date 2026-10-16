import * as Effect from "effect/Effect";

import type * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import { fetchViewerLogin } from "./t3team-githubViewerSearch.ts";
import { rateLimitMessageOf } from "./t3team-githubRestRead.ts";

/** Who the host's credential is, or why that could not be told. */
export type AccountRead = {
  readonly account?: string;
  /** Set when the read was held back by the rate limit: "signed out" would be the wrong answer. */
  readonly pausedMessage?: string;
};

/**
 * The login behind the host's GitHub credential, read through `GitHubApi` so it shares the
 * credential, quota and rate-limit pause of every other read. A refusal other than the rate limit
 * (no credential, signed out, unreachable) is reported as no account, as `gh api user` was.
 */
export function loadAccount(host: string): Effect.Effect<AccountRead, never, GitHubApi.GitHubApi> {
  return fetchViewerLogin(host, "t3team.github.account").pipe(
    Effect.map((login): AccountRead => (login === null ? {} : { account: login })),
    Effect.catch((error) => {
      const pausedMessage = rateLimitMessageOf(error);
      return Effect.succeed<AccountRead>(pausedMessage === undefined ? {} : { pausedMessage });
    }),
  );
}
