import {
  type CloudSession,
  CloudSessionFailedError,
  type CloudSessionListResult,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as GitHubCli from "../sourceControl/GitHubCli.ts";
import {
  cancelRunInvocation,
  dispatchSessionInvocation,
  listRunsInvocation,
  parseRunsResponse,
  sessionTagMarker,
  type GhInvocation,
  type WorkflowRunSummary,
} from "./t3team-githubActionsSessionClient.ts";
import { toCloudSessionFailure } from "./t3team-CloudSessionErrors.ts";
import { resolveFleetConfig } from "./t3team-CloudSessionFleet.ts";
import {
  makeSessionTag,
  pendingCloudSession,
  projectCloudSession,
} from "./t3team-CloudSessionProjection.ts";

/**
 * Starts and tracks *cloud sessions*: full Nexi workspaces provisioned on
 * remote compute, which join the user's environment list once their relay link
 * is up.
 *
 * There is no credential to configure. Provisioning runs through `gh`, exactly
 * as pull-request reading does (`GitHubPullRequestCli`), so a session inherits
 * the login the user already has — which is the whole point of the surface:
 * one click, no setup.
 *
 * Where each concern lives:
 * - the fleet's identity (host, repo, runner label) is in
 *   `t3team-CloudSessionFleet`,
 * - gh failures are mapped onto user-visible reasons in
 *   `t3team-CloudSessionErrors`,
 * - the run → session projection and dispatch correlation in
 *   `t3team-CloudSessionProjection`.
 */

/**
 * Recent runs worth considering. Generous on purpose: this window is also what
 * `cancel` checks membership against, so a session that scrolls out of it would
 * become uncancellable while still running.
 */
const RUN_HISTORY_LIMIT = 100;

/** Sessions shown to the user. The window above is for correctness, not display. */
const SESSION_DISPLAY_LIMIT = 20;

/** `gh` is a child process on a network call; give it more room than a local command. */
const GH_TIMEOUT_MS = 30_000;

/** One-second polls after a dispatch, waiting for the run to become visible. */
const DISPATCH_DISCOVERY_ATTEMPTS = 10;

export class CloudSessionService extends Context.Service<
  CloudSessionService,
  {
    readonly list: Effect.Effect<CloudSessionListResult, CloudSessionFailedError>;
    readonly create: (input: {
      readonly durationSeconds: number;
    }) => Effect.Effect<CloudSession, CloudSessionFailedError>;
    readonly cancel: (input: {
      readonly sessionId: string;
    }) => Effect.Effect<void, CloudSessionFailedError>;
  }
>()("t3/cloud/t3team-CloudSessionService/CloudSessionService") {}

export const make = Effect.fn("cloud.session_service.make")(function* () {
  const github = yield* GitHubCli.GitHubCli;
  const { repoRef, machineLabel } = yield* resolveFleetConfig();

  /**
   * `gh` needs a cwd; it is irrelevant for `gh api --hostname`, which does not
   * consult the repository, but the process still has to start somewhere.
   */
  const cwd = yield* Config.string("HOME").pipe(Config.withDefault("/"));

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
   * Runs of the session workflow only — the endpoint is scoped to
   * `session.yml`, which is what makes membership checkable at all.
   *
   * An unparseable response fails rather than reading as "no runs": treating
   * "we could not tell" as "nothing is running" would both hide live sessions
   * and let a pre-existing run be mistaken for a freshly dispatched one.
   */
  const listRuns = run(listRunsInvocation(repoRef, RUN_HISTORY_LIMIT)).pipe(
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

  const list: CloudSessionService["Service"]["list"] = Effect.gen(function* () {
    const runs = yield* listRuns;
    const nowMs = yield* Clock.currentTimeMillis;
    const sessions = yield* Effect.forEach(
      runs.slice(0, SESSION_DISPLAY_LIMIT),
      (item) => projectCloudSession(item, nowMs, machineLabel, repoRef, run),
      { concurrency: 4 },
    );
    return { sessions, configured: true } satisfies CloudSessionListResult;
  }).pipe(
    // A server with no `gh` at all cannot ever start a session, so report it as
    // unconfigured and let the client offer setup.
    //
    // `unauthorized` is deliberately NOT swallowed. It is indistinguishable
    // from a transient credential blip, and answering "no sessions" to that
    // would make a user's running workspaces silently disappear from the UI —
    // far worse than showing an error, because it looks like they stopped.
    Effect.catchIf(
      (error) => error.reason === "not_configured",
      () => Effect.succeed({ sessions: [], configured: false } satisfies CloudSessionListResult),
    ),
  );

  const create: CloudSessionService["Service"]["create"] = (input) =>
    Effect.gen(function* () {
      // A tag unique to THIS dispatch. `workflow_dispatch` answers 204 with no
      // body, so it never reveals the run it created; the workflow echoes this
      // into `run-name`, which is the only way to find our own run. Picking
      // "newest run we had not seen" instead is wrong under concurrency — two
      // users dispatching in the same second can each be handed the other's
      // session, and then cancelling yours kills theirs.
      const sessionTag = yield* makeSessionTag;
      const marker = sessionTagMarker(sessionTag);

      yield* run(
        dispatchSessionInvocation(repoRef, {
          hold_minutes: String(Math.max(1, Math.round(input.durationSeconds / 60))),
          session_tag: sessionTag,
        }),
      );

      // The run does not appear instantly, so poll for the one carrying our tag.
      const pollForTaggedRun = (
        attemptsLeft: number,
      ): Effect.Effect<WorkflowRunSummary | null, CloudSessionFailedError> =>
        attemptsLeft <= 0
          ? Effect.succeed(null)
          : Effect.gen(function* () {
              yield* Effect.sleep("1 second");
              const runs = yield* listRuns;
              const mine = runs.find((item) => item.name.includes(marker));
              return mine === undefined ? yield* pollForTaggedRun(attemptsLeft - 1) : mine;
            });

      const discovered = yield* pollForTaggedRun(DISPATCH_DISCOVERY_ATTEMPTS);

      if (discovered === null) {
        return pendingCloudSession(sessionTag, input.durationSeconds, machineLabel);
      }
      return yield* projectCloudSession(
        discovered,
        yield* Clock.currentTimeMillis,
        machineLabel,
        repoRef,
        run,
      );
    });

  const cancel: CloudSessionService["Service"]["cancel"] = (input) =>
    Effect.gen(function* () {
      const runId = Number(input.sessionId);
      if (!Number.isSafeInteger(runId) || runId <= 0) {
        // A session still waiting for its run to surface carries a tag-derived
        // id and has nothing cancellable behind it yet.
        return yield* new CloudSessionFailedError({
          reason: "unknown_session",
          message: "That session cannot be cancelled yet.",
        });
      }

      // The cancel endpoint is repository-wide: it will happily stop ANY run in
      // `hive/nx-nexi`, including a deployment. `listRuns` is scoped to
      // `session.yml`, so requiring membership here is what stops a caller from
      // passing an arbitrary run id and cancelling something that is not a
      // cloud session at all.
      const sessionRuns = yield* listRuns;
      if (!sessionRuns.some((item) => item.id === runId)) {
        return yield* new CloudSessionFailedError({
          reason: "unknown_session",
          message: "That session does not exist.",
        });
      }

      yield* run(cancelRunInvocation(repoRef, runId)).pipe(Effect.asVoid);
    });

  return { list, create, cancel } as const;
});

export const layer = Layer.effect(CloudSessionService, make());
