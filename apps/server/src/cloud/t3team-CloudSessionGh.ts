/**
 * The gh-execution half of a cloud session: how the service drives `gh` for the
 * session workflow — running a single invocation, listing one login's runs, and
 * resolving the caller's login. Kept apart from `CloudSessionService` so that
 * file stays focused on the list/create/cancel orchestration.
 *
 * Everything here inherits the user's existing `gh` login (same host, same
 * keyring token as dispatch) — no credential of its own.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as GitHubCli from "../sourceControl/GitHubCli.ts";
import {
  currentLoginInvocation,
  listRunsInvocation,
  parseLogin,
  parseRunsResponse,
  type CloudSessionRepoRef,
  type GhInvocation,
} from "./t3team-githubActionsSessionClient.ts";
import { toCloudSessionFailure } from "./t3team-CloudSessionErrors.ts";

/** Recent runs worth considering; also the window `cancel` checks membership against. */
const RUN_HISTORY_LIMIT = 100;

/** `gh` is a child process on a network call; give it more room than a local command. */
const GH_TIMEOUT_MS = 30_000;

/**
 * Bundle the three gh operations a cloud session needs, bound to one `gh`
 * executor and one fleet repo. `listRunsFor` and `resolveLogin` are the two
 * pieces that make per-user isolation work: the list is always scoped to the
 * login that `resolveLogin` returns.
 */
export function makeSessionGh(
  github: GitHubCli.GitHubCli["Service"],
  repoRef: CloudSessionRepoRef,
  cwd: string,
) {
  /** Run one `gh` invocation, mapping its errors to user-visible session failures. */
  const run = (invocation: GhInvocation) =>
    github
      .execute({
        cwd,
        args: invocation.args,
        timeoutMs: GH_TIMEOUT_MS,
        ...(invocation.stdin === undefined ? {} : { stdin: invocation.stdin }),
      })
      .pipe(Effect.mapError(toCloudSessionFailure));

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
    run(listRunsInvocation(repoRef, RUN_HISTORY_LIMIT, login)).pipe(
      Effect.flatMap((result) => {
        const parsed = parseRunsResponse(result.stdout);
        if (parsed === null || result.stdoutTruncated) {
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
   * Resolve the GitHub login the current `gh` credential is signed in as — the
   * same identity dispatch uses. Every list/cancel is scoped to this login,
   * which is the whole per-user isolation. If it cannot be resolved we fail
   * closed: returning a list we could not scope would leak other users' sessions.
   */
  const resolveLogin = Effect.gen(function* () {
    const result = yield* run(currentLoginInvocation(repoRef));
    const login = parseLogin(result.stdout);
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
