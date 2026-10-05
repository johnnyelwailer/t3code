import { CloudSessionFailedError, ProjectId } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitHubCli from "../sourceControl/GitHubCli.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import * as ConnectCredentialMinter from "./t3team-ConnectCredentialMinter.ts";
import * as NexiBrokerService from "./t3team-NexiBrokerService.ts";
import { ConnectCredentialMintError } from "./t3team-ConnectCredentialMintError.ts";
import * as CloudSessionService from "./t3team-CloudSessionService.ts";
import { CloudSessionMachines } from "./t3team-CloudSessionMachine.ts";

/** Sessions here are plain ones: no project, so the machine resolver is never consulted. */
const noMachines = Layer.mock(CloudSessionMachines)({
  resolve: () => Effect.die("these sessions have no project"),
});

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
 * Runs a create that reaches the dispatch. `it.effect` installs a TestClock that
 * never advances on its own, so the discovery poll's one-second `Effect.sleep`
 * is released by advancing it; the poll then makes its (single, matching) attempt.
 */
const runPastDiscoveryPoll = <A, E>(create: Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(create);
    yield* TestClock.adjust("1 second");
    return yield* Fiber.join(fiber);
  });

/**
 * A stateful fake gh: records every call, captures the dispatch tag, and hands
 * the tag back in the run list so the discovery poll finds our own run on the
 * first attempt. `login` is what the `user --jq .login` identity call returns;
 * pass `""` to simulate an unresolvable identity.
 */
const makeGithubMock = (
  options: {
    login?: string;
    runStatus?: string;
    /** The cancel call fails (GitHub's 409), and later listings show this status. */
    cancelFailsThenStatus?: string;
  } = {},
) => {
  const login = options.login ?? "pj";
  let cancelAttempted = false;
  const calls: Array<{ args: readonly string[]; stdin?: string | undefined }> = [];
  let tag: string | null = null;
  const execute = (input: {
    cwd: string;
    args: readonly string[];
    timeoutMs?: number;
    stdin?: string;
    maxOutputBytes?: number;
  }): Effect.Effect<VcsProcess.VcsProcessOutput, GitHubCli.GitHubCliError> =>
    Effect.suspend(() => {
      calls.push({ args: input.args, stdin: input.stdin });
      const joined = input.args.join(" ");
      if (joined.includes("/cancel") && options.cancelFailsThenStatus !== undefined) {
        cancelAttempted = true;
        return Effect.fail(
          new GitHubCli.GitHubCliCommandError({ command: "gh", cwd: "", cause: "HTTP 409" }),
        );
      }
      return Effect.succeed(respond(joined, input.stdin));
    });
  const respond = (joined: string, stdin: string | undefined): VcsProcess.VcsProcessOutput => {
    if (joined.includes("--jq")) {
      // The identity-resolution call: `gh api --hostname … user --jq .login`
      // prints the bare login plus a trailing newline.
      return ghOut(`${login}\n`);
    }
    if (joined.includes("repos/hive/nx-nexi/issues") && joined.includes("POST")) {
      return ghOut(encodeGitHubIssueCreate({ number: 42 }));
    }
    if (joined.includes("/dispatches")) {
      const parsed = decodeGhDispatch(stdin ?? "{}");
      tag = parsed.inputs?.session_tag ?? null;
      return ghOut("");
    }
    if (joined.includes("/cancel")) {
      // GitHub answers 409 for a run that already completed; a cancel must never get here then.
      return ghOut("{}");
    }
    if (joined.includes("/runs")) {
      return ghOut(
        encodeGhWorkflowRuns({
          workflow_runs: [
            {
              id: 999,
              status:
                (cancelAttempted ? options.cancelFailsThenStatus : undefined) ??
                options.runStatus ??
                "completed",
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
  };
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
      const providers = Layer.mergeAll(
        ghMock,
        cloudCliMock,
        minterMock,
        noMachines,
        configLayer,
        NexiBrokerService.layerDisabled,
      );
      // Expose the service AND its runtime dependencies to the create effect.
      const full = Layer.mergeAll(
        CloudSessionService.layer.pipe(Layer.provide(providers)),
        providers,
      );

      const session = yield* runPastDiscoveryPoll(
        Effect.service(CloudSessionService.CloudSessionService).pipe(
          Effect.flatMap((svc) => svc.create({ durationSeconds: 3600 })),
          Effect.provide(full),
        ),
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
        noMachines,
        configLayer,
        NexiBrokerService.layerDisabled,
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
        noMachines,
        configLayer,
        NexiBrokerService.layerDisabled,
      );
      const full = Layer.mergeAll(
        CloudSessionService.layer.pipe(Layer.provide(providers)),
        providers,
      );

      const session = yield* runPastDiscoveryPoll(
        Effect.service(CloudSessionService.CloudSessionService).pipe(
          Effect.flatMap((svc) => svc.create({ durationSeconds: 3600 })),
          Effect.provide(full),
        ),
      );

      // The mint ran, then the handoff delivered the fresh credential.
      assert.lengthOf(mintCalls, 1);
      const payloadCall = calls.find((call) =>
        call.args.join(" ").includes("repos/hive/nx-nexi/issues"),
      );
      assert.isNotNull(payloadCall);
      const parsed = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(Schema.Struct({ body: Schema.String })),
      )(payloadCall!.stdin ?? "{}");
      const decoded = Buffer.from(parsed.body, "base64").toString("utf8");
      assert.include(decoded, "fresh-rt");
      assert.isTrue(calls.some((call) => call.args.join(" ").includes("/dispatches")));
      assert.equal(session.phase, "stopped");
    }),
  );
});

/**
 * Provider layers for a service wired to a fake gh, mirroring the create test:
 * empty env → handoff flag ON, default fleet config. `getExisting` is `none`
 * because these tests never reach the credential handoff.
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
    noMachines,
    ghMock,
    cloudCliMock,
    minterMock,
    configLayer,
    NexiBrokerService.layerDisabled,
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

const isCloudSessionFailed = Schema.is(CloudSessionFailedError);

describe("CloudSessionService.create over the Nexi broker", () => {
  const brokerMock = (
    requestGrant: (
      login: string,
      secrets?: Readonly<Record<string, string>>,
    ) => Effect.Effect<string, CloudSessionFailedError>,
  ) =>
    Layer.succeed(NexiBrokerService.NexiBrokerService, {
      enabled: true,
      status: Effect.die("unused"),
      signIn: Effect.die("unused"),
      signOut: Effect.void,
      requestGrant,
      attach: () => Effect.die("unused"),
      pair: () => Effect.die("unused"),
    });
  const providersWith = (
    execute: ReturnType<typeof makeGithubMock>["execute"],
    broker: ReturnType<typeof brokerMock>,
    machines: Layer.Layer<CloudSessionMachines> = noMachines,
  ) =>
    Layer.mergeAll(
      machines,
      Layer.mock(GitHubCli.GitHubCli)({ execute }),
      Layer.mock(CliTokenManager.CloudCliTokenManager)({
        getExisting: Effect.succeed(Option.none()),
      }),
      Layer.mock(ConnectCredentialMinter.ConnectCredentialMinter)({
        mint: () => Effect.die("broker mode must never mint a T3 Connect credential"),
      }),
      ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })),
      broker,
    );
  const create = (providers: ReturnType<typeof providersWith>, projectId?: ProjectId) =>
    Effect.service(CloudSessionService.CloudSessionService).pipe(
      Effect.flatMap((svc) =>
        svc.create({ durationSeconds: 3600, ...(projectId ? { projectId } : {}) }),
      ),
      Effect.provide(
        Layer.mergeAll(CloudSessionService.layer.pipe(Layer.provide(providers)), providers),
      ),
    );

  it.effect("dispatches with a grant for the caller's login and skips the T3 Connect handoff", () =>
    Effect.gen(function* () {
      const { calls, execute } = makeGithubMock();
      const grantedFor: string[] = [];
      const providers = providersWith(
        execute,
        brokerMock((login) => Effect.sync(() => (grantedFor.push(login), "grant-xyz"))),
      );
      yield* runPastDiscoveryPoll(create(providers));
      assert.deepEqual(grantedFor, ["pj"]);
      const joined = calls.map((call) => call.args.join(" "));
      assert.isFalse(
        joined.some((args) => args.includes("repos/hive/nx-nexi/issues")),
        "no credential payload issue",
      );
      const dispatch = calls.find((call) => call.args.join(" ").includes("/dispatches"));
      assert.include(dispatch?.stdin ?? "", '"broker_grant":"grant-xyz"');
    }),
  );

  it.effect("a project machine's token rides with the grant, never in the dispatch inputs", () =>
    Effect.gen(function* () {
      const { calls, execute } = makeGithubMock();
      const parked: Array<Readonly<Record<string, string>> | undefined> = [];
      const machines = Layer.mock(CloudSessionMachines)({
        resolve: () =>
          Effect.succeed({
            repository: {
              url: "https://nexplore.ghe.com/acme/api.git",
              host: "nexplore.ghe.com",
              owner: "acme",
              name: "api",
            },
            commit: "a".repeat(40),
            devcontainerPath: ".devcontainer/devcontainer.json",
            healthCheck: "pnpm test --run smoke",
            workspace: "machine-acme.api",
            token: "ghp_never-an-input",
            author: { name: "Pj", email: "pj@example.test" },
          }),
      });
      const broker = brokerMock((_login, secrets) =>
        Effect.sync(() => (parked.push(secrets), "g")),
      );
      yield* runPastDiscoveryPoll(
        create(providersWith(execute, broker, machines), ProjectId.make("p1")),
      );
      assert.deepEqual(parked, [
        {
          GIT_TOKEN: "ghp_never-an-input",
          GIT_AUTHOR_NAME: "Pj",
          GIT_AUTHOR_EMAIL: "pj@example.test",
        },
      ]);
      const dispatch = calls.find((call) => call.args.join(" ").includes("/dispatches"))?.stdin;
      for (const input of [
        '"machine_repository":"https://nexplore.ghe.com/acme/api.git"',
        `"machine_commit":"${"a".repeat(40)}"`,
        '"machine_devcontainer":".devcontainer/devcontainer.json"',
        '"workspace":"machine-acme.api"',
        '"machine_health_check":"pnpm test --run smoke"',
      ]) {
        assert.include(dispatch ?? "", input);
      }
      const everything = calls
        .map((call) => `${call.args.join(" ")} ${call.stdin ?? ""}`)
        .join("\n");
      assert.notInclude(everything, "ghp_never-an-input");
    }),
  );

  it.effect("signed out: fails with broker_sign_in_required before dispatching anything", () =>
    Effect.gen(function* () {
      const { calls, execute } = makeGithubMock();
      const signedOut = new CloudSessionFailedError({
        reason: "broker_sign_in_required",
        message: "Sign in",
      });
      const failure = yield* Effect.flip(
        create(
          providersWith(
            execute,
            brokerMock(() => Effect.fail(signedOut)),
          ),
        ),
      );
      assert.isTrue(isCloudSessionFailed(failure) && failure.reason === "broker_sign_in_required");
      assert.isFalse(calls.some((call) => call.args.join(" ").includes("/dispatches")));
    }),
  );
});

describe("CloudSessionService.cancel", () => {
  const cancelSession = (runStatus: string, cancelFailsThenStatus?: string) =>
    Effect.gen(function* () {
      const { calls, execute } = makeGithubMock({
        runStatus,
        ...(cancelFailsThenStatus !== undefined ? { cancelFailsThenStatus } : {}),
      });
      const providers = Layer.mergeAll(
        noMachines,
        Layer.mock(GitHubCli.GitHubCli)({ execute }),
        Layer.mock(CliTokenManager.CloudCliTokenManager)({
          getExisting: Effect.succeed(Option.none()),
        }),
        Layer.mock(ConnectCredentialMinter.ConnectCredentialMinter)({
          mint: () => Effect.die("cancel never mints"),
        }),
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })),
        NexiBrokerService.layerDisabled,
      );
      yield* Effect.service(CloudSessionService.CloudSessionService).pipe(
        Effect.flatMap((svc) => svc.cancel({ sessionId: "999" })),
        Effect.provide(CloudSessionService.layer.pipe(Layer.provide(providers))),
      );
      return calls.filter((call) => call.args.join(" ").includes("/cancel")).length;
    });

  it.effect("cancels a session that is still running", () =>
    Effect.gen(function* () {
      assert.equal(yield* cancelSession("in_progress"), 1);
    }),
  );

  it.effect("treats stopping a session that already ended as done, not an error", () =>
    Effect.gen(function* () {
      // A second Stop click, or one after the session's time ran out.
      assert.equal(yield* cancelSession("completed"), 0);
    }),
  );

  it.effect("treats a session that ended just before the cancel as stopped", () =>
    Effect.gen(function* () {
      // Listed as running, then GitHub refuses the cancel because the run finished meanwhile.
      assert.equal(yield* cancelSession("in_progress", "completed"), 1);
    }),
  );

  it.effect("still fails when the cancel is refused for a session that keeps running", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(cancelSession("in_progress", "in_progress"));
      assert.isTrue(exit._tag === "Failure");
    }),
  );
});
