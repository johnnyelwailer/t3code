import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  listRepositorySecretNames,
  setRepositorySecretValue,
} from "./t3team-repositorySecretGh.ts";
import * as GitHubCli from "./sourceControl/GitHubCli.ts";

const ghLayer = (handler: GitHubCli.GitHubCli["Service"]["execute"]) =>
  Layer.succeed(GitHubCli.GitHubCli, {
    execute: handler,
  } as GitHubCli.GitHubCli["Service"]);

describe("repository secret gh helpers", () => {
  it.effect("lists secret names from gh JSON", () =>
    Effect.gen(function* () {
      const names = yield* listRepositorySecretNames({
        cwd: "/repo",
        host: "github.com",
        repository: "acme/widgets",
      }).pipe(
        Effect.provide(
          ghLayer(() =>
            Effect.succeed({
              exitCode: 0,
              stdout: JSON.stringify([{ name: "NPM_TOKEN" }, { name: "OTHER" }]),
              stderr: "",
              durationMs: 1,
            }),
          ),
        ),
      );
      assert.deepStrictEqual(names, ["NPM_TOKEN", "OTHER"]);
    }),
  );

  it.effect("maps 403 on set to permission_denied", () =>
    Effect.gen(function* () {
      const error = yield* setRepositorySecretValue({
        cwd: "/repo",
        host: "github.com",
        repository: "acme/widgets",
        name: "NPM_TOKEN",
        value: "s3cret",
      }).pipe(
        Effect.provide(
          ghLayer(() =>
            Effect.fail(
              new GitHubCli.GitHubCliCommandError({
                command: "gh",
                cwd: "/repo",
                cause: { message: "HTTP 403: Must have admin rights to Repository", stderr: "" },
              }),
            ),
          ),
        ),
        Effect.flip,
      );
      assert.strictEqual(error.kind, "permission_denied");
    }),
  );

  it.effect("pipes the value on stdin and never on argv", () =>
    Effect.gen(function* () {
      let seen: { args: ReadonlyArray<string>; stdin?: string } | undefined;
      yield* setRepositorySecretValue({
        cwd: "/repo",
        host: "nexplore.ghe.com",
        repository: "hive/nx-nexi",
        name: "NPM_TOKEN",
        value: "s3cret-value",
      }).pipe(
        Effect.provide(
          ghLayer((input) => {
            seen = { args: input.args, stdin: input.stdin };
            return Effect.succeed({
              exitCode: 0,
              stdout: "",
              stderr: "",
              durationMs: 1,
            });
          }),
        ),
      );
      assert.ok(seen);
      assert.ok(!seen!.args.includes("s3cret-value"));
      assert.strictEqual(seen!.stdin, "s3cret-value");
      assert.include(seen!.args, "--body");
      assert.include(seen!.args, "-");
    }),
  );
});
