import { assert, describe, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitHubCli from "../sourceControl/GitHubCli.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import * as CloudSessionService from "./t3team-CloudSessionService.ts";

const ghOut = (stdout: string): VcsProcess.VcsProcessOutput => ({
  exitCode: ChildProcessSpawner.ExitCode(0),
  stdout,
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
});

/**
 * A real-time clock. `it.effect` installs a fake clock that never advances on
 * its own, which would hang the discovery poll's `Effect.sleep`; this one
 * actually waits so the poll can make its (single, matching) attempt.
 */
const realClock: Clock.Clock = {
  currentTimeMillisUnsafe: () => Date.now(),
  currentTimeMillis: Effect.succeed(0),
  currentTimeNanosUnsafe: () => 0n,
  currentTimeNanos: Effect.succeed(0n),
  monotonicTimeNanosUnsafe: () => 0n,
  sleep: (duration: number) =>
    Effect.callback((resume) => {
      setTimeout(() => resume(Effect.void), duration / 1e6);
    }),
} as unknown as Clock.Clock;

/**
 * A stateful fake gh: records every call, captures the dispatch tag, and hands
 * the tag back in the run list so the discovery poll finds our own run on the
 * first attempt.
 */
const makeGithubMock = () => {
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
      if (joined.includes("repos/hive/nx-nexi/issues") && joined.includes("POST")) {
        return ghOut(JSON.stringify({ number: 42 }));
      }
      if (joined.includes("/dispatches")) {
        const parsed = JSON.parse(input.stdin ?? "{}") as { inputs?: { session_tag?: string } };
        tag = parsed.inputs?.session_tag ?? null;
        return ghOut("");
      }
      if (joined.includes("/runs")) {
        return ghOut(
          JSON.stringify({
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
      // Empty env: handoff flag unset → default ON; fleet config → its defaults.
      const configLayer = ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }));
      // A real clock: the discovery poll sleeps between attempts, and the
      // harness default is a fake clock that never advances on its own.
      const providers = Layer.mergeAll(
        ghMock,
        cloudCliMock,
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
      const parsed = JSON.parse(payloadCall?.stdin ?? "{}") as { title: string; body: string };
      assert.match(parsed.title, /^nexi-session payload \[s[0-9a-z]+\]$/);
      const decoded = Buffer.from(parsed.body, "base64").toString("utf8");
      assert.include(decoded, "refreshToken");

      assert.equal(session.phase, "stopped");
      assert.equal(session.failureReason, null);
    }),
  );
});
