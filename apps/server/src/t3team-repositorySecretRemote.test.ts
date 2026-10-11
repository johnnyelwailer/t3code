import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { resolveRepositorySecretRemote } from "./t3team-repositorySecretRemote.ts";
import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";

const gitLayer = (stdout: string, exitCode = 0) =>
  Layer.succeed(GitVcsDriver.GitVcsDriver, {
    execute: () =>
      Effect.succeed({
        exitCode,
        stdout,
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
      }),
  } as unknown as GitVcsDriver.GitVcsDriver["Service"]);

describe("resolveRepositorySecretRemote", () => {
  it.effect("parses github.com HTTPS origin", () =>
    Effect.gen(function* () {
      const remote = yield* resolveRepositorySecretRemote("/repo").pipe(
        Effect.provide(gitLayer("https://github.com/acme/widgets.git\n")),
      );
      assert.deepStrictEqual(remote, { host: "github.com", repository: "acme/widgets" });
    }),
  );

  it.effect("parses GHE SSH origin", () =>
    Effect.gen(function* () {
      const remote = yield* resolveRepositorySecretRemote("/repo").pipe(
        Effect.provide(gitLayer("git@nexplore.ghe.com:hive/nx-nexi.git\n")),
      );
      assert.deepStrictEqual(remote, { host: "nexplore.ghe.com", repository: "hive/nx-nexi" });
    }),
  );

  it.effect("fails when origin is missing", () =>
    Effect.gen(function* () {
      const error = yield* resolveRepositorySecretRemote("/repo").pipe(
        Effect.provide(gitLayer("", 2)),
        Effect.flip,
      );
      assert.include(error, "no origin remote");
    }),
  );
});
