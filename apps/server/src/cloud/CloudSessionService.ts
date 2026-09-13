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

/** Recent runs worth showing. Anything older has long since stopped. */
const RUN_HISTORY_LIMIT = 20;

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

  const listRuns = run(listRunsInvocation(repoRef, RUN_HISTORY_LIMIT)).pipe(
    Effect.map((result) => parseRunsResponse(result.stdout)),
  );

  const toSession = (
    sessionRun: WorkflowRunSummary,
    nowMs: number,
  ): Effect.Effect<CloudSession, CloudSessionFailedError> =>
    Effect.gen(function* () {
      const steps: readonly WorkflowJobStep[] = isRunSettled(sessionRun)
        ? []
        : yield* run(jobStepsInvocation(repoRef, sessionRun.id)).pipe(
            Effect.map((result) => parseJobStepsResponse(result.stdout)),
            // Progress detail is a nicety: a run whose steps cannot be read is
            // still a real session, so fall back to the run-level phase rather
            // than failing the whole list.
            Effect.orElseSucceed((): readonly WorkflowJobStep[] => []),
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
    const sessions = yield* Effect.forEach(runs, (item) => toSession(item, nowMs), {
      concurrency: 4,
    });
    return { sessions, configured: true } satisfies CloudSessionListResult;
  }).pipe(
    // A server with no `gh`, or one not signed in, is not broken — it is
    // unconfigured. Reporting that lets the client offer setup instead of
    // rendering a permanently empty list.
    Effect.catchIf(
      (error) => error.reason === "not_configured" || error.reason === "unauthorized",
      () => Effect.succeed({ sessions: [], configured: false } satisfies CloudSessionListResult),
    ),
  );

  const create: CloudSessionService["Service"]["create"] = (input) =>
    Effect.gen(function* () {
      const before = yield* listRuns;
      const knownIds = new Set(before.map((item) => item.id));

      yield* run(
        dispatchSessionInvocation(repoRef, {
          hold_minutes: String(Math.max(1, Math.round(input.durationSeconds / 60))),
        }),
      );

      // `workflow_dispatch` answers 204 with no body: it does not report the run
      // id, and the run does not appear instantly. Poll briefly for the first id
      // we have not seen. If it never shows, still report a session — the
      // dispatch succeeded, and the next list reconciles it.
      const pollForNewRun = (
        attemptsLeft: number,
      ): Effect.Effect<WorkflowRunSummary | null, CloudSessionFailedError> =>
        attemptsLeft <= 0
          ? Effect.succeed(null)
          : Effect.gen(function* () {
              yield* Effect.sleep("1 second");
              const runs = yield* listRuns;
              const fresh = runs.find((item) => !knownIds.has(item.id));
              return fresh === undefined ? yield* pollForNewRun(attemptsLeft - 1) : fresh;
            });

      const discovered = yield* pollForNewRun(DISPATCH_DISCOVERY_ATTEMPTS);

      if (discovered === null) {
        return {
          sessionId: `pending-${yield* Clock.currentTimeMillis}`,
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
        // A session still waiting for its run id carries a `pending-` id and has
        // nothing cancellable behind it yet.
        return yield* new CloudSessionFailedError({
          reason: "unknown_session",
          message: "That session cannot be cancelled yet.",
        });
      }
      yield* run(cancelRunInvocation(repoRef, runId)).pipe(Effect.asVoid);
    });

  return { list, create, cancel } as const;
});

export const layer = Layer.effect(CloudSessionService, make());
