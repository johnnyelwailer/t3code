import {
  type CloudSession,
  CloudSessionFailedError,
  type CloudSessionListResult,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as GitHubCli from "../sourceControl/GitHubCli.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import {
  cancelRunInvocation,
  listRunsInvocation,
  parseRunsResponse,
  type GhInvocation,
} from "./t3team-githubActionsSessionClient.ts";
import { toCloudSessionFailure } from "./t3team-CloudSessionErrors.ts";
import { isSessionCredentialIssueEnabled } from "./t3team-CloudSessionCredential.ts";
import { resolveFleetConfig } from "./t3team-CloudSessionFleet.ts";
import { ConnectCredentialMinter } from "./t3team-ConnectCredentialMinter.ts";
import { dispatchAndDiscoverSession } from "./t3team-CloudSessionDispatch.ts";
import { dispatchCredentialHandoff } from "./t3team-CloudSessionMintGate.ts";
import { makeSessionTag, projectCloudSession } from "./t3team-CloudSessionProjection.ts";

/**
 * Starts and tracks *cloud sessions*: full Nexi workspaces provisioned on
 * remote compute, which join the user's environment list once their relay link
 * is up.
 *
 * Provisioning runs through `gh` (as pull-request reading does), and the
 * creator's connect credential is handed to the VM on demand via a tag-keyed
 * payload issue (see `t3team-CloudSessionCredential`). The run → session
 * projection and dispatch correlation live in `t3team-CloudSessionProjection`;
 * gh failures map to user-visible reasons in `t3team-CloudSessionErrors`; the
 * fleet's identity in `t3team-CloudSessionFleet`.
 */

/** Recent runs worth considering; also the window `cancel` checks membership against. */
const RUN_HISTORY_LIMIT = 100;

/** Sessions shown to the user. The window above is for correctness, not display. */
const SESSION_DISPLAY_LIMIT = 20;

/** `gh` is a child process on a network call; give it more room than a local command. */
const GH_TIMEOUT_MS = 30_000;

/** One-second polls after a dispatch, waiting for the run to become visible. */
const DISPATCH_DISCOVERY_ATTEMPTS = 10;

/**
 * How long a create may spend on a fresh in-app sign-in before it gives up
 * and answers with the pending-sign-in error. The browser round-trip keeps
 * running in the background after that, so the user's retry rides it.
 */
const CREATE_MINT_WAIT = Duration.seconds(45);

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
  const cloudCli = yield* CliTokenManager.CloudCliTokenManager;
  const minter = yield* ConnectCredentialMinter;
  const handoffEnabled = yield* isSessionCredentialIssueEnabled();
  const { repoRef, machineLabel } = yield* resolveFleetConfig();

  // `gh` needs a cwd; irrelevant for `gh api --hostname`, but the process starts somewhere.
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

      // Credential handoff, with the in-app mint fallback: if this machine
      // has no usable T3 Connect credential yet, the mint (a browser
      // round-trip, zero manual steps) gets a bounded chance to finish here;
      // otherwise the user is told their sign-in is pending in the browser.
      yield* dispatchCredentialHandoff({
        repoRef,
        sessionTag,
        run,
        enabled: handoffEnabled,
        readCredential: cloudCli.getExisting,
        mint: minter.mint,
        mintTimeout: CREATE_MINT_WAIT,
      });

      return yield* dispatchAndDiscoverSession({
        repoRef,
        sessionTag,
        durationSeconds: input.durationSeconds,
        machineLabel,
        run,
        listRuns,
        discoveryAttempts: DISPATCH_DISCOVERY_ATTEMPTS,
      });
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
