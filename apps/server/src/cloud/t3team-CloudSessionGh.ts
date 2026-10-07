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
import * as Effect from "effect/Effect";
import type * as GitHubApi from "../sourceControl/GitHubApi.ts";
import {
  currentLoginRequest,
  listRunsRequest,
  type CloudSessionRepoRef,
  type GitHubActionsRequest,
  type GitHubActionsResponse,
} from "./t3team-githubActionsSessionClient.ts";
import { parseLogin, parseRunsResponse } from "./t3team-githubActionsSessionParse.ts";
import { toCloudSessionFailure } from "./t3team-CloudSessionErrors.ts";

/** Recent runs worth considering; also the window `cancel` checks membership against. */
const RUN_HISTORY_LIMIT = 100;

/** A session request is a network call on the user's behalf; it may spend the GraphQL reserve. */
const ALLOW_RESERVE = true;

/**
 * Bundle the three GitHub operations a cloud session needs, bound to one API
 * client and one fleet repo. `listRunsFor` and `resolveLogin` are the two
 * pieces that make per-user isolation work: the list is always scoped to the
 * login that `resolveLogin` returns.
 */
export function makeSessionGh(api: GitHubApi.GitHubApi["Service"], repoRef: CloudSessionRepoRef) {
  /** Run one request, mapping its errors to user-visible session failures. */
  const run = (
    request: GitHubActionsRequest,
  ): Effect.Effect<GitHubActionsResponse, CloudSessionFailedError> =>
    (request.kind === "graphql"
      ? api
          .graphql({
            host: repoRef.host,
            operation: request.operation,
            query: request.query,
            ...(request.variables === undefined ? {} : { variables: request.variables }),
            allowReserve: ALLOW_RESERVE,
          })
          .pipe(Effect.map((body) => ({ body, truncated: false })))
      : api
          .rest({
            host: repoRef.host,
            operation: request.operation,
            path: request.path,
            ...(request.method === undefined ? {} : { method: request.method }),
            ...(request.body === undefined ? {} : { body: request.body }),
            allowReserve: ALLOW_RESERVE,
          })
          .pipe(Effect.map((response) => ({ body: response.body, truncated: response.truncated })))
    ).pipe(Effect.mapError(toCloudSessionFailure));

  /**
   * Runs of the session workflow, scoped to one login — the endpoint is scoped
   * to `session.yml` AND to the caller's `actor`, which is what makes both
   * per-user isolation and membership checkable at all.
   *
   * An unparseable response fails rather than reading as "no runs": treating
   * "we could not tell" as "nothing is running" would both hide live sessions
   * and let a pre-existing run be mistaken for a freshly dispatched one.
   */
  const listRunsFor = (login: string) =>
    run(listRunsRequest(repoRef, RUN_HISTORY_LIMIT, login)).pipe(
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
        return Effect.succeed(parsed);
      }),
    );

  /**
   * Resolve the GitHub login the fleet host's credential belongs to — the same
   * identity dispatch uses. Every list/cancel is scoped to this login, which is
   * the whole per-user isolation. If it cannot be resolved we fail closed:
   * returning a list we could not scope would leak other users' sessions.
   */
  const resolveLogin = Effect.gen(function* () {
    const result = yield* run(currentLoginRequest(repoRef));
    const login = parseLogin(result.body);
    if (login === null) {
      return yield* new CloudSessionFailedError({
        reason: "unauthorized",
        message: "Could not determine your GitHub identity, so your sessions cannot be listed.",
      });
    }
    return login;
  });

  return { run, listRunsFor, resolveLogin } as const;
}
