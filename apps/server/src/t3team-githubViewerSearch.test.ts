import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ChildProcessSpawner } from "effect/process";
import * as TestClock from "effect/testing/TestClock";

import { readSignedInGitHubHosts } from "./t3team-githubViewerSearch.ts";
import * as VcsProcess from "./vcs/VcsProcess.ts";

const statusFor = (hosts: ReadonlyArray<string>) =>
  JSON.stringify({
    hosts: Object.fromEntries(
      hosts.map((host) => [host, [{ state: "success", active: true, host, login: "me" }]]),
    ),
  });

/** A `gh` whose `auth status` answers come from `answers`, one per spawn; counts the spawns. */
function fakeGh(answers: Array<string | "fail">) {
  const spawns: Array<ReadonlyArray<string>> = [];
  const layer = Layer.mock(VcsProcess.VcsProcess)({
    run: (input) => {
      spawns.push(input.args ?? []);
      const answer = answers.shift() ?? "fail";
      return answer === "fail"
        ? Effect.fail("no gh" as never)
        : Effect.succeed({
            exitCode: ChildProcessSpawner.ExitCode(0),
            stdout: answer,
            stderr: "",
            stdoutTruncated: false,
            stderrTruncated: false,
          } as never);
    },
  });
  return { layer, spawns };
}

describe("readSignedInGitHubHosts", () => {
  it.effect("asks gh once per interval, since `gh auth status` validates against the API", () =>
    Effect.gen(function* () {
      const { layer, spawns } = fakeGh([statusFor(["github.com"]), statusFor(["ghe.example"])]);
      yield* Effect.gen(function* () {
        const first = yield* readSignedInGitHubHosts;
        const second = yield* readSignedInGitHubHosts;
        expect(first.hosts).toEqual(["github.com"]);
        expect(second.hosts).toEqual(["github.com"]);
        expect(spawns).toHaveLength(1);

        yield* TestClock.adjust(Duration.minutes(3));
        const third = yield* readSignedInGitHubHosts;
        expect(third.hosts).toEqual(["ghe.example"]);
        expect(spawns).toHaveLength(2);
      }).pipe(Effect.provide(layer));
    }),
  );

  it.effect("never keeps an answer gh could not give, and retries a no-host answer soon", () =>
    Effect.gen(function* () {
      const { layer, spawns } = fakeGh(["fail", statusFor([]), statusFor(["github.com"])]);
      yield* Effect.gen(function* () {
        expect(yield* readSignedInGitHubHosts).toEqual({ hosts: [], ok: false });
        expect((yield* readSignedInGitHubHosts).ok).toBe(true);
        expect(spawns).toHaveLength(2);

        yield* TestClock.adjust(Duration.seconds(11));
        expect((yield* readSignedInGitHubHosts).hosts).toEqual(["github.com"]);
        expect(spawns).toHaveLength(3);
      }).pipe(Effect.provide(layer));
    }),
  );
});
