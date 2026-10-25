/**
 * The GitHub-request half of a cloud session: how the service drives the fleet
 * repository's API for the session workflow — running a single request, listing
 * one login's runs, and resolving the caller's login. Kept apart from
 * `CloudSessionService` so that file stays focused on the list/create/cancel
 * orchestration.
 *
 * Everything here goes through `GitHubApi`, so it inherits the user's existing
 * credential for the fleet host — no credential of its own, and the same
 * rate-limit pause and API base URL (GitHub Enterprise included) as every other
 * GitHub read on the server.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import type * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import {
  currentLoginRequest,
  listRunsRequest,
  type CloudSessionRepoRef,
  type GitHubActionsRequest,
  type GitHubActionsResponse,
} from "@t3tools/shared/t3team-cloudSessionActionsRequests";
import { parseLogin, parseRunsResponse } from "@t3tools/shared/t3team-cloudSessionActionsParse";
import { sessionRunsForLogin } from "@t3tools/shared/t3team-cloudSessionRunOwnership";
import { toCloudSessionFailure } from "./t3team-CloudSessionErrors.ts";
import { makeLoginMemo } from "./t3team-CloudSessionLoginMemo.ts";
import { isCacheableRead, makeSessionReadCache } from "./t3team-CloudSessionReadCache.ts";

/** Recent runs worth considering; also the window `cancel` checks membership against. */
const RUN_HISTORY_LIMIT = 100;

export type SessionGhRunOptions = {
  /**
   * When true, the call may spend the GitHubQuota reserve and bypass a
   * SourceControlRateLimit pause — for a user-initiated create/cancel only.
   * Background list/poll reads leave the reserve alone and honour the pause.
   */
  readonly allowReserve?: boolean;
};

/**
 * Background reads share one answer process-wide (see `GitHubRestInput.coalesce`); a user's own
 * create/cancel always reads fresh, since it acts on what it reads.
 */
function coalesceFor(coalesce: { readonly ttlMs: number } | undefined, allowReserve: boolean) {
  return coalesce === undefined || allowReserve
    ? {}
    : { coalesce: { ttl: Duration.millis(coalesce.ttlMs) } };
}

/**
 * Bundle the three GitHub operations a cloud session needs, bound to one API
 * client and one fleet repo. `listRunsFor` and `resolveLogin` are the two
 * pieces that make per-user isolation work: the list is always scoped to the
 * login that `resolveLogin` returns.
 */
export const makeSessionGh = Effect.fn("cloud.session_gh.make")(function* (
  api: GitHubApi.GitHubApi["Service"],
  repoRef: CloudSessionRepoRef,
) {
  // Re-hitting `GET /user` every list burns quota for nothing; memoised per credential identity.
  const logins = makeLoginMemo();

  /**
   * Whose credential a request to the fleet host carries right now (a pinned one when the
   * caller pinned it) — the key that keeps one user's login or list from answering another.
   * Reads the held credential's fingerprint; no GHE request.
   */
  const identity: Effect.Effect<string, CloudSessionFailedError> = api
    .credential(repoRef.host)
    .pipe(
      Effect.map((credential) => credential.fingerprint),
      Effect.mapError(toCloudSessionFailure),
    );

  /** One request, errors mapped to user-visible session failures; no caching. */
  const execute = (
    request: GitHubActionsRequest,
    allowReserve: boolean,
  ): Effect.Effect<GitHubActionsResponse, CloudSessionFailedError> =>
    (request.kind === "graphql"
      ? api
          .graphql({
            host: repoRef.host,
            operation: request.operation,
            query: request.query,
            ...(request.variables === undefined ? {} : { variables: request.variables }),
            allowReserve,
          })
          .pipe(Effect.map((body) => ({ body, truncated: false })))
      : api
          .rest({
            host: repoRef.host,
            operation: request.operation,
            path: request.path,
            ...(request.method === undefined ? {} : { method: request.method }),
            ...(request.body === undefined ? {} : { body: request.body }),
            allowReserve,
            ...coalesceFor(request.coalesce, allowReserve),
          })
          .pipe(Effect.map((response) => ({ body: response.body, truncated: response.truncated })))
    ).pipe(Effect.mapError(toCloudSessionFailure));

  /**
   * Reads that declare a `lifetime` (a run's job steps) are cached and
   * single-flighted: briefly while the run is live, for good once it settled.
   * Always at background priority — progress detail is a nicety, never a reason
   * to spend the quota reserve.
   */
  const cachedRead = yield* makeSessionReadCache((request) => execute(request, false));

  /** Run one request, honouring the cache for the reads that opt in. */
  const run = (
    request: GitHubActionsRequest,
    options?: SessionGhRunOptions,
  ): Effect.Effect<GitHubActionsResponse, CloudSessionFailedError> =>
    isCacheableRead(request)
      ? cachedRead(request)
      : execute(request, options?.allowReserve === true);

  /** Background reads: honour the rate-limit pause and leave the quota reserve. */
  const runBackground = (
    request: GitHubActionsRequest,
  ): Effect.Effect<GitHubActionsResponse, CloudSessionFailedError> =>
    run(request, { allowReserve: false });

  /** User-initiated mutate path: may spend the reserve / enter a pause window. */
  const runInteractive = (
    request: GitHubActionsRequest,
  ): Effect.Effect<GitHubActionsResponse, CloudSessionFailedError> =>
    run(request, { allowReserve: true });

  /**
   * Runs of the session workflow, scoped to one login — the endpoint is scoped
   * to `session.yml` AND to the caller's `actor`, which is what makes both
   * per-user isolation and membership checkable at all.
   *
   * An unparseable response fails rather than reading as "no runs": treating
   * "we could not tell" as "nothing is running" would both hide live sessions
   * and let a pre-existing run be mistaken for a freshly dispatched one.
   */
  const listRunsFor = (login: string, options?: SessionGhRunOptions) =>
    run(listRunsRequest(repoRef, RUN_HISTORY_LIMIT, login), options).pipe(
      Effect.flatMap((result) => {
        const parsed = parseRunsResponse(result.body);
        if (parsed === null || result.truncated) {
          return Effect.fail(
            new CloudSessionFailedError({
              reason: "unreachable",
              message: "The provider returned an unreadable session list.",
            }),
          );
        }
        return Effect.succeed(sessionRunsForLogin(parsed, login));
      }),
    );

  /**
   * Resolve the GitHub login the fleet host's credential belongs to — the same
   * identity dispatch uses. Every list/cancel is scoped to this login, which is
   * the whole per-user isolation. If it cannot be resolved we fail closed:
   * returning a list we could not scope would leak other users' sessions.
   */
  const resolveLogin = (options?: SessionGhRunOptions) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      // No resolvable identity means no memo: ask the host, which reports the real failure.
      const who = yield* Effect.orElseSucceed(identity, () => null);
      const memoised = who === null ? undefined : logins.get(who, now);
      if (memoised !== undefined) return memoised;
      const result = yield* run(currentLoginRequest(repoRef), options);
      const login = parseLogin(result.body);
      if (login === null) {
        return yield* new CloudSessionFailedError({
          reason: "unauthorized",
          message: `Could not determine your GitHub identity on ${repoRef.host}, so your sessions cannot be listed.`,
        });
      }
      if (who !== null) logins.set(who, login, now);
      return login;
    });

  return { run, runBackground, runInteractive, listRunsFor, resolveLogin, identity } as const;
});
