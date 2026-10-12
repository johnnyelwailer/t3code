import { assert, describe, it } from "@effect/vitest";
import { VcsProcessExitError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as TestClock from "effect/testing/TestClock";
import { ChildProcessSpawner } from "effect/process";

import * as GitHubApi from "./sourceControl/GitHubApi.ts";
import * as GitHubQuota from "./sourceControl/githubQuota.ts";
import * as SourceControlRateLimit from "./sourceControl/SourceControlRateLimit.ts";
import { ghApiTarget, guardGhApiProcess } from "./t3team-ghCliRateLimitGuard.ts";
import type { VcsProcessShape } from "./t3team-vcsProcessShape.ts";

const NOW = Date.parse("2026-10-12T12:00:00.000Z");

const api: GitHubApi.GitHubApi["Service"] = {
  rest: () => Effect.die("unused"),
  graphql: () => Effect.die("unused"),
  credential: (host) =>
    Effect.succeed({ token: Redacted.make("token"), fingerprint: `${host}:token` }),
};

const output = {
  exitCode: ChildProcessSpawner.ExitCode(0),
  stdout: "[]",
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
};

const rateLimitedExit = (input: { readonly command: string }) =>
  new VcsProcessExitError({
    operation: "t3team.github.inbox",
    command: input.command,
    cwd: "/",
    exitCode: 1,
    detail: "API rate limit exceeded.",
    failureKind: "rate-limited",
  });

const layer = Layer.mergeAll(GitHubQuota.layer, SourceControlRateLimit.layer);

function guardedRunner(answer: (call: number) => "ok" | "rate-limited") {
  const calls: Array<ReadonlyArray<string>> = [];
  const vcs: VcsProcessShape = {
    run: (input) => {
      calls.push(input.args);
      return answer(calls.length) === "ok"
        ? Effect.succeed(output)
        : Effect.fail(rateLimitedExit(input));
    },
  };
  return {
    calls,
    guarded: Effect.gen(function* () {
      return guardGhApiProcess(vcs, {
        api,
        limits: yield* SourceControlRateLimit.SourceControlRateLimit,
        quota: yield* GitHubQuota.GitHubQuota,
      });
    }),
  };
}

const inbox = {
  operation: "t3team.github.inbox",
  command: "gh",
  args: ["api", "--hostname", "nexplore.ghe.com", "/notifications?per_page=25"],
  cwd: "/",
} as const;

describe("ghApiTarget", () => {
  it("reads the host and path out of a gh api call, and ignores other commands", () => {
    assert.deepStrictEqual(ghApiTarget(inbox), {
      host: "nexplore.ghe.com",
      path: "/notifications?per_page=25",
    });
    assert.deepStrictEqual(
      ghApiTarget({
        command: "gh",
        args: ["api", "user", "--hostname", "GitHub.com", "--jq", ".login"],
      }),
      { host: "github.com", path: "user" },
    );
    assert.strictEqual(ghApiTarget({ command: "gh", args: ["auth", "token"] }), null);
    assert.strictEqual(ghApiTarget({ command: "git", args: ["api"] }), null);
  });
});

describe("guardGhApiProcess", () => {
  it.effect("fails fast while the host is paused, and goes through again once it lapses", () => {
    const { calls, guarded } = guardedRunner((call) => (call === 1 ? "rate-limited" : "ok"));
    return Effect.gen(function* () {
      yield* TestClock.setTime(NOW);
      const vcs = yield* guarded;
      const tripped = yield* Effect.flip(vcs.run(inbox));
      assert.strictEqual(tripped._tag, "VcsProcessExitError");
      const refused = yield* Effect.flip(vcs.run(inbox));
      assert.strictEqual(refused._tag, "SourceControlRateLimitPausedError");
      assert.strictEqual(calls.length, 1);
      yield* TestClock.adjust("31 seconds");
      yield* vcs.run(inbox);
      assert.strictEqual(calls.length, 2);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    "shares the pause with GitHubApi's own requests, and leaves other commands alone",
    () => {
      const { calls, guarded } = guardedRunner(() => "ok");
      return Effect.gen(function* () {
        yield* TestClock.setTime(NOW);
        const limits = yield* SourceControlRateLimit.SourceControlRateLimit;
        const key = { provider: "github" as const, host: "nexplore.ghe.com" };
        yield* SourceControlRateLimit.CredentialScope.pipe(
          Effect.flatMap(() => limits.recordRateLimit({ ...key, lease: 0, retryAt: NOW + 60_000 })),
          Effect.provideService(SourceControlRateLimit.CredentialScope, "nexplore.ghe.com:token"),
        );
        const vcs = yield* guarded;
        const refused = yield* Effect.flip(vcs.run(inbox));
        assert.strictEqual(refused._tag, "SourceControlRateLimitPausedError");
        yield* vcs.run({ ...inbox, args: ["auth", "token", "--hostname", "nexplore.ghe.com"] });
        assert.strictEqual(calls.length, 1);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect("holds a search call at the search reserve", () => {
    const { calls, guarded } = guardedRunner(() => "ok");
    return Effect.gen(function* () {
      yield* TestClock.setTime(NOW);
      const quota = yield* GitHubQuota.GitHubQuota;
      yield* quota
        .observe("nexplore.ghe.com", {
          "x-ratelimit-resource": "search",
          "x-ratelimit-limit": "30",
          "x-ratelimit-remaining": "1",
          "x-ratelimit-reset": String(NOW / 1000 + 60),
        })
        .pipe(
          Effect.provideService(SourceControlRateLimit.CredentialScope, "nexplore.ghe.com:token"),
        );
      const vcs = yield* guarded;
      const search = {
        ...inbox,
        args: ["api", "--hostname", "nexplore.ghe.com", "/search/repositories?q=x"],
      };
      const refused = yield* Effect.flip(vcs.run(search));
      assert.strictEqual(refused._tag, "SourceControlRateLimitPausedError");
      yield* vcs.run(inbox);
      assert.strictEqual(calls.length, 1);
    }).pipe(Effect.provide(layer));
  });
});
