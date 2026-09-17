import {
  CloudSessionFailedError,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitHubCli from "../sourceControl/GitHubCli.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import * as ConnectCredentialMinter from "./t3team-ConnectCredentialMinter.ts";
import { ConnectCredentialMintError } from "./t3team-ConnectCredentialMintError.ts";
import * as CloudSessionService from "./t3team-CloudSessionService.ts";

const ghOut = (stdout: string): VcsProcess.VcsProcessOutput => ({
  exitCode: ChildProcessSpawner.ExitCode(0),
  stdout,
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
});

/** JSON shapes the fake gh emits/consumes; encoded and decoded through effect/Schema. */
const GitHubIssueCreateJson = Schema.Struct({ number: Schema.Number });
const encodeGitHubIssueCreate = Schema.encodeSync(Schema.fromJsonString(GitHubIssueCreateJson));
const GhDispatchInputsJson = Schema.Struct({
  inputs: Schema.optional(Schema.Struct({ session_tag: Schema.optional(Schema.String) })),
});
const decodeGhDispatch = Schema.decodeSync(Schema.fromJsonString(GhDispatchInputsJson));
const GhWorkflowRunsJson = Schema.Struct({
  workflow_runs: Schema.Array(
    Schema.Struct({
      id: Schema.Number,
      status: Schema.String,
      conclusion: Schema.String,
      created_at: Schema.String,
      updated_at: Schema.String,
      html_url: Schema.String,
      name: Schema.String,
    }),
  ),
});
const encodeGhWorkflowRuns = Schema.encodeSync(Schema.fromJsonString(GhWorkflowRunsJson));
const GhPayloadIssueJson = Schema.Struct({ title: Schema.String, body: Schema.String });
const decodeGhPayloadIssue = Schema.decodeSync(Schema.fromJsonString(GhPayloadIssueJson));

/**
 * A real-time clock. `it.effect` installs a fake clock that never advances on
 * its own, which would hang the discovery poll's `Effect.sleep`; this one
 * actually waits so the poll can make its (single, matching) attempt.
 */
const realClock: Clock.Clock = {
  currentTimeMillisUnsafe: () => DateTime.toEpochMillis(DateTime.nowUnsafe()),
  currentTimeMillis: Effect.succeed(0),
  currentTimeNanosUnsafe: () => 0n,
  currentTimeNanos: Effect.succeed(0n),
  monotonicTimeNanosUnsafe: () => 0n,
  monotonicTimeNanos: Effect.succeed(0n),
  sleep: (duration: Duration.Duration) =>
    Effect.callback<void, never>((resume) => {
      // Effect.sleep would resolve against the ambient clock — this very clock — so
      // bridge to the default runtime, whose clock is the real system one.
      void Effect.runPromise(Effect.sleep(duration)).then(
        () => resume(Effect.void),
        (error) => resume(Effect.die(error)),
      );
    }),
};

/**
 * A stateful fake gh: records every call, captures the dispatch tag, and hands
 * the tag back in the run list so the discovery poll finds our own run on the
 * first attempt. `login` is what the `user --jq .login` identity call returns;
 * pass `""` to simulate an unresolvable identity.
 */
const makeGithubMock = (options: { login?: string } = {}) => {
  const login = options.login ?? "pj";
  const calls: Array<{ args: readonly string[]; stdin?: string | undefined }> = [];
  let tag: string | null = null;
  const execute = (input: {
    cwd: string;
    args: readonly string[];
    timeoutMs?: number;
    stdin?: string;
    maxOutputBytes?: number;
  }): Effect.Effect<VcsProcess.VcsProcessOutput, GitHubCli.GitHubCliError> =>
    Effect.sync(() => {
      calls.push({ args: input.args, stdin: input.stdin });
      const joined = input.args.join(" ");
      if (joined.includes("--jq")) {
        // The identity-resolution call: `gh api --hostname … user --jq .login`
        // prints the bare login plus a trailing newline.
        return ghOut(`${login}\n`);
      }
      if (joined.includes("repos/hive/nx-nexi/issues") && joined.includes("POST")) {
        return ghOut(encodeGitHubIssueCreate({ number: 42 }));
      }
      if (joined.includes("/dispatches")) {
        const parsed = decodeGhDispatch(input.stdin ?? "{}");
        tag = parsed.inputs?.session_tag ?? null;
        return ghOut("");
      }
      if (joined.includes("/runs")) {
        return ghOut(
          encodeGhWorkflowRuns({
            workflow_runs: [
              {
                id: 999,
                status: "completed",
                conclusion: "success",
                created_at: "2026-09-14T12:00:00Z",
                updated_at: "2026-09-14T12:00:01Z",
                html_url: "https://nexplore.ghe.com/hive/nx-nexi/actions/runs/999",
                name: `hive/nx-nexi [main] [${tag}]`,
              },
            ],
          }),
        );
      }
      return ghOut("{}");
    });
  return { calls, execute };
};

describe("CloudSessionService.create credential handoff", () => {
  it.effect("writes the payload issue, then dispatches, then resolves the session", () =>
    Effect.gen(function* () {
      const { calls, execute } = makeGithubMock();

      const ghMock = Layer.mock(GitHubCli.GitHubCli)({ execute });
      const cloudCliMock = Layer.mock(CliTokenManager.CloudCliTokenManager)({
        getExisting: Effect.succeed(
          Option.some({
            accessToken: "at",
            refreshToken: "rt",
            expiresAtEpochMs: 9_999_999_999_999,
          }),
        ),
      });
      // A usable credential is present, so the mint must never be attempted.
      const minterMock = Layer.mock(ConnectCredentialMinter.ConnectCredentialMinter)({
        mint: () => Effect.die("the mint must not run when a credential exists"),
      });
      // Empty env: handoff flag unset → default ON; fleet config → its defaults.
      const configLayer = ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }));
      // A real clock: the discovery poll sleeps between attempts, and the
      // harness default is a fake clock that never advances on its own.
      const providers = Layer.mergeAll(
        ghMock,
        cloudCliMock,
        minterMock,
        configLayer,
        Layer.succeed(Clock.Clock, realClock),
      );
      // Expose the service AND its runtime dependencies to the create effect.
      const full = Layer.mergeAll(
        CloudSessionService.layer.pipe(Layer.provide(providers)),
        providers,
      );

      const session = yield* Effect.service(CloudSessionService.CloudSessionService).pipe(
        Effect.flatMap((svc) => svc.create({ durationSeconds: 3600 })),
        Effect.provide(full),
      );

      // The handoff ran first (payload issue), the dispatch second.
      const joinedCalls = calls.map((call) => call.args.join(" "));
      assert.isTrue(joinedCalls.some((args) => args.includes("repos/hive/nx-nexi/issues")));
      assert.isTrue(joinedCalls.some((args) => args.includes("/dispatches")));
      // The payload issue body was base64 (not raw JSON) and carried the refresh token.
      const payloadCall = calls.find((call) =>
        call.args.join(" ").includes("repos/hive/nx-nexi/issues"),
      );
      const parsed = decodeGhPayloadIssue(payloadCall?.stdin ?? "{}");
      assert.match(parsed.title, /^nexi-session payload \[s[0-9a-z]+\]$/);
      const decoded = Buffer.from(parsed.body, "base64").toString("utf8");
      assert.include(decoded, "refreshToken");

      assert.equal(session.phase, "stopped");
      assert.equal(session.failureReason, null);
    }),
  );

  it.effect("answers connect_sign_in_pending when the mint did not finish in time", () =>
    Effect.gen(function* () {
      const { calls, execute } = makeGithubMock();

      const ghMock = Layer.mock(GitHubCli.GitHubCli)({ execute });
      // No usable credential, ever: the mint starts, times out (here: fails
      // immediately), and the handoff still fails with connect_sign_in_required.
      const cloudCliMock = Layer.mock(CliTokenManager.CloudCliTokenManager)({
        getExisting: Effect.succeed(Option.none()),
      });
      const mintCalls: Array<unknown> = [];
      const minterMock = Layer.mock(ConnectCredentialMinter.ConnectCredentialMinter)({
        mint: (input) =>
          Effect.sync(() => mintCalls.push(input)).pipe(
            Effect.flatMap(() =>
              Effect.fail(
                new ConnectCredentialMintError({
                  reason: "browser_callback_timeout",
                }),
              ),
            ),
          ),
      });
      const configLayer = ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }));
      const providers = Layer.mergeAll(
        ghMock,
        cloudCliMock,
        minterMock,
        configLayer,
        Layer.succeed(Clock.Clock, realClock),
      );
      const full = Layer.mergeAll(
        CloudSessionService.layer.pipe(Layer.provide(providers)),
        providers,
      );

      const error = yield* Effect.service(CloudSessionService.CloudSessionService).pipe(
        Effect.flatMap((svc) => svc.create({ durationSeconds: 3600 })),
        Effect.provide(full),
        Effect.flip,
      );

      // The friendly pending reason — NOT the bare sign-in-required one —
      // because a sign-in IS in flight and the browser still has it open.
      assert.equal(error._tag, "CloudSessionFailedError");
      if (Schema.is(CloudSessionFailedError)(error)) {
        assert.equal(error.reason, "connect_sign_in_pending");
        assert.match(error.message, /finishing in your browser/);
      }
      // The mint was attempted with the bounded create-side wait…
      assert.lengthOf(mintCalls, 1);
      // …and the dispatch never happened.
      assert.isFalse(calls.some((call) => call.args.join(" ").includes("/dispatches")));
    }),
  );

  it.effect("dispatches when the mint finishes within the bounded wait", () =>
    Effect.gen(function* () {
      const { calls, execute } = makeGithubMock();

      const ghMock = Layer.mock(GitHubCli.GitHubCli)({ execute });
      // First read (the gate's check): no credential. After the mint "succeeds",
      // the handoff's read finds the freshly minted one.
      let reads = 0;
      const cloudCliMock = Layer.mock(CliTokenManager.CloudCliTokenManager)({
        getExisting: Effect.sync(() =>
          ++reads === 1
            ? Option.none()
            : Option.some({
                accessToken: "fresh-at",
                refreshToken: "fresh-rt",
                expiresAtEpochMs: 9_999_999_999_999,
              }),
        ),
      });
      const mintCalls: Array<unknown> = [];
      const minterMock = Layer.mock(ConnectCredentialMinter.ConnectCredentialMinter)({
        mint: (input) => Effect.sync(() => mintCalls.push(input)).pipe(Effect.asVoid),
      });
      const configLayer = ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }));
      const providers = Layer.mergeAll(
        ghMock,
        cloudCliMock,
        minterMock,
        configLayer,
        Layer.succeed(Clock.Clock, realClock),
      );
      const full = Layer.mergeAll(
        CloudSessionService.layer.pipe(Layer.provide(providers)),
        providers,
      );

      const session = yield* Effect.service(CloudSessionService.CloudSessionService).pipe(
        Effect.flatMap((svc) => svc.create({ durationSeconds: 3600 })),
        Effect.provide(full),
      );

      // The mint ran, then the handoff delivered the fresh credential.
      assert.lengthOf(mintCalls, 1);
      const payloadCall = calls.find((call) =>
        call.args.join(" ").includes("repos/hive/nx-nexi/issues"),
      );
      assert.isNotNull(payloadCall);
      const parsed = JSON.parse(payloadCall!.stdin ?? "{}") as { body: string };
      const decoded = Buffer.from(parsed.body, "base64").toString("utf8");
      assert.include(decoded, "fresh-rt");
      assert.isTrue(calls.some((call) => call.args.join(" ").includes("/dispatches")));
      assert.equal(session.phase, "stopped");
    }),
  );
});

/**
 * Provider layers for a service wired to a fake gh, mirroring the create test:
 * empty env → handoff flag ON, default fleet config, a real clock so any poll
 * can sleep. `getExisting` is `none` because these tests never reach the
 * credential handoff.
 */
const providersFor = (
  execute: (input: {
    cwd: string;
    args: readonly string[];
    timeoutMs?: number;
    stdin?: string;
    maxOutputBytes?: number;
  }) => Effect.Effect<VcsProcess.VcsProcessOutput, GitHubCli.GitHubCliError>,
) => {
  const ghMock = Layer.mock(GitHubCli.GitHubCli)({ execute });
  const cloudCliMock = Layer.mock(CliTokenManager.CloudCliTokenManager)({
    getExisting: Effect.succeed(Option.none()),
  });
  // The service's `make` always acquires the minter in its context (even when
  // these list tests never reach the credential handoff); die loudly if a mint
  // is ever attempted here.
  const minterMock = Layer.mock(ConnectCredentialMinter.ConnectCredentialMinter)({
    mint: () => Effect.die("the mint must not run in the list tests"),
  });
  const configLayer = ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }));
  return Layer.mergeAll(
    ghMock,
    cloudCliMock,
    minterMock,
    configLayer,
    Layer.succeed(Clock.Clock, realClock),
  );
};

describe("CloudSessionService.list per-user isolation", () => {
  it.effect("scopes the list to the caller's login via the server-side actor filter", () =>
    Effect.gen(function* () {
      const { calls, execute } = makeGithubMock();
      const providers = providersFor(execute);
      const full = Layer.mergeAll(
        CloudSessionService.layer.pipe(Layer.provide(providers)),
        providers,
      );

      const result = yield* Effect.service(CloudSessionService.CloudSessionService).pipe(
        Effect.flatMap((svc) => svc.list),
        Effect.provide(full),
      );

      // It resolved the caller's login from the same gh identity before fetching…
      assert.isTrue(
        calls.some((c) => c.args.join(" ").includes("--jq") && c.args.join(" ").includes("user")),
      );
      // …and the runs query carried that login as the server-side actor filter.
      const runsArgs = calls.map((c) => c.args.join(" ")).find((a) => a.includes("/runs"));
      assert.isTrue(runsArgs !== undefined && runsArgs.includes("actor=pj"));

      // And the list still resolves to the caller's own session.
      assert.equal(result.configured, true);
      assert.equal(result.sessions.length, 1);
      assert.equal(result.sessions[0]?.sessionId, "999");
    }),
  );

  it.effect("fails closed when the caller's login cannot be resolved", () =>
    Effect.gen(function* () {
      const { calls, execute } = makeGithubMock({ login: "" });
      const providers = providersFor(execute);
      const full = Layer.mergeAll(
        CloudSessionService.layer.pipe(Layer.provide(providers)),
        providers,
      );

      const outcome = yield* Effect.service(CloudSessionService.CloudSessionService).pipe(
        Effect.flatMap((svc) => svc.list),
        Effect.match({
          onSuccess: () => ({ kind: "success" as const }),
          onFailure: (error) => ({ kind: "failure" as const, error }),
        }),
        Effect.provide(full),
      );

      // An unresolvable identity must surface an error, never an unscoped list.
      assert.equal(outcome.kind, "failure");
      if (outcome.kind === "failure") {
        assert.equal(outcome.error.reason, "unauthorized");
      }
      // Fail-closed: no runs fetch happened at all.
      assert.isFalse(calls.some((c) => c.args.join(" ").includes("/runs")));
    }),
  );
});
