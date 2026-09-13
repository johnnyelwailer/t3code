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
import * as Random from "effect/Random";

import * as GitHubCli from "../sourceControl/GitHubCli.ts";
import { cloudSessionElapsedSeconds, deriveCloudSessionPhase } from "./cloudSessionPhase.ts";
import {
  cancelRunInvocation,
  type CloudSessionRepoRef,
  dispatchSessionInvocation,
  type GhInvocation,
  jobStepsInvocation,
  listRunsInvocation,
  parseJobStepsResponse,
  parseRunsResponse,
  sessionTagMarker,
  type WorkflowJobStep,
  type WorkflowRunSummary,
} from "./githubActionsSessionClient.ts";

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
 * The defaults below describe the Nexplore fleet. They are overridable by
 * environment variable for anyone pointing at a different repository.
 */

const DEFAULT_HOST = "nexplore.ghe.com";
const DEFAULT_OWNER = "hive";
const DEFAULT_REPO = "nx-nexi";
const DEFAULT_WORKFLOW_FILE_NAME = "session.yml";

/**
 * The fleet's runner shape, read from the live orchestrator rather than
 * guessed: `ubuntu-slim` VMs are 12288 MB across 4 cores.
 */
const DEFAULT_MACHINE_LABEL = "ubuntu-slim · 12 GB · 4 cores";

/**
 * Recent runs worth considering. Generous on purpose: this window is also what
 * `cancel` checks membership against, so a session that scrolls out of it would
 * become uncancellable while still running.
 */
const RUN_HISTORY_LIMIT = 100;

/** Sessions shown to the user. The window above is for correctness, not display. */
const SESSION_DISPLAY_LIMIT = 20;

/** Session ids for a dispatch whose run has not surfaced yet. */
const PENDING_SESSION_PREFIX = "pending:";

function pendingSessionId(sessionTag: string): string {
  return `${PENDING_SESSION_PREFIX}${sessionTag}`;
}

/**
 * A correlation tag for one dispatch. Random rather than time-based: two
 * clients dispatching in the same millisecond must not collide, which is the
 * whole failure this exists to prevent.
 */
const makeSessionTag = Effect.map(
  Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER),
  (value) => `s${value.toString(36)}`,
);

/** One-second polls after a dispatch, waiting for the run to become visible. */
const DISPATCH_DISCOVERY_ATTEMPTS = 10;

/** `gh` is a child process on a network call; give it more room than a local command. */
const GH_TIMEOUT_MS = 30_000;

/** Bound what a provider error can contribute to a user-visible message. */
const ERROR_DETAIL_LIMIT = 300;

/**
 * Fetching steps costs one `gh` call per run, and only a moving run can change
 * phase from its steps — a settled run's phase comes from status/conclusion
 * alone. Skipping settled runs keeps a full list to a handful of calls.
 */
const isRunSettled = (run: WorkflowRunSummary): boolean => run.status === "completed";

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
>()("t3/cloud/CloudSessionService") {}

/**
 * Map a `gh` failure onto a reason the client can act on.
 *
 * `GitHubCli` already separates "gh missing" and "not logged in" from a plain
 * command failure, which is exactly the distinction the surface needs: the
 * first two mean *set something up*, the third means *this request failed*.
 */
function toFailure(error: GitHubCli.GitHubCliError): CloudSessionFailedError {
  switch (error._tag) {
    case "GitHubCliUnavailableError":
      return new CloudSessionFailedError({
        reason: "not_configured",
        message: "The GitHub CLI is not installed, so cloud sessions cannot be started.",
      });
    case "GitHubCliAuthenticationError":
      return new CloudSessionFailedError({
        reason: "unauthorized",
        message: "The GitHub CLI is not signed in to the cloud session host.",
      });
    case "GitHubCliRateLimitError":
      return new CloudSessionFailedError({
        reason: "rejected",
        message: "The provider is rate limiting cloud session requests. Try again shortly.",
      });
    default:
      return new CloudSessionFailedError({
        reason: "rejected",
        message: String(error.message ?? "The provider refused the request.").slice(
          0,
          ERROR_DETAIL_LIMIT,
        ),
      });
  }
}

export const make = Effect.fn("cloud.session_service.make")(function* () {
  const github = yield* GitHubCli.GitHubCli;

  const repoRef: CloudSessionRepoRef = {
    host: yield* Config.string("T3CODE_CLOUD_SESSION_HOST").pipe(Config.withDefault(DEFAULT_HOST)),
    owner: yield* Config.string("T3CODE_CLOUD_SESSION_OWNER").pipe(
      Config.withDefault(DEFAULT_OWNER),
    ),
    repo: yield* Config.string("T3CODE_CLOUD_SESSION_REPO").pipe(Config.withDefault(DEFAULT_REPO)),
    workflowFileName: yield* Config.string("T3CODE_CLOUD_SESSION_WORKFLOW").pipe(
      Config.withDefault(DEFAULT_WORKFLOW_FILE_NAME),
    ),
  };
  const machineLabel = yield* Config.string("T3CODE_CLOUD_SESSION_MACHINE_LABEL").pipe(
    Config.withDefault(DEFAULT_MACHINE_LABEL),
  );

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
      .pipe(Effect.mapError(toFailure));

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

  const toSession = (
    sessionRun: WorkflowRunSummary,
    nowMs: number,
  ): Effect.Effect<CloudSession, CloudSessionFailedError> =>
    Effect.gen(function* () {
      // `null` means "we could not read the steps", which is NOT the same as
      // "there are no steps yet". Passing `[]` here would report `requested`
      // for a running session and march its phase backwards on one flaky poll.
      const steps: readonly WorkflowJobStep[] | null = isRunSettled(sessionRun)
        ? []
        : yield* run(jobStepsInvocation(repoRef, sessionRun.id)).pipe(
            Effect.map((result) =>
              result.stdoutTruncated ? null : parseJobStepsResponse(result.stdout),
            ),
            // Progress detail is a nicety: a run whose steps cannot be read is
            // still a real session, so degrade to the run-level phase rather
            // than failing the whole list.
            Effect.orElseSucceed((): readonly WorkflowJobStep[] | null => null),
          );
      const phase = deriveCloudSessionPhase(sessionRun, steps);
      return {
        sessionId: String(sessionRun.id),
        providerKind: "github_actions",
        phase,
        elapsedSeconds: cloudSessionElapsedSeconds(sessionRun, nowMs),
        // The workflow owns the hold duration, so the server does not invent a
        // remainder it cannot actually know.
        remainingSeconds: null,
        machineLabel,
        failureReason:
          phase === "failed"
            ? (sessionRun.conclusion ?? "The session stopped before it became reachable.")
            : null,
        detailsUrl: sessionRun.htmlUrl === "" ? null : sessionRun.htmlUrl,
      } satisfies CloudSession;
    });

  const list: CloudSessionService["Service"]["list"] = Effect.gen(function* () {
    const runs = yield* listRuns;
    const nowMs = yield* Clock.currentTimeMillis;
    const sessions = yield* Effect.forEach(
      runs.slice(0, SESSION_DISPLAY_LIMIT),
      (item) => toSession(item, nowMs),
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
        // The dispatch succeeded but the run has not surfaced yet. Report the
        // session under its tag rather than a throwaway id, so a later `list`
        // resolves the same session to the same identity and `cancel` keeps
        // working once the run appears.
        return {
          sessionId: pendingSessionId(sessionTag),
          providerKind: "github_actions",
          phase: "requested",
          elapsedSeconds: 0,
          remainingSeconds: input.durationSeconds,
          machineLabel,
          failureReason: null,
          detailsUrl: null,
        } satisfies CloudSession;
      }
      return yield* toSession(discovered, yield* Clock.currentTimeMillis);
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
