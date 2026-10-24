import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import { SourceControlProviderKind, VcsProcessTimeoutError } from "@t3tools/contracts";
import { PullRequestProviderError } from "@t3tools/source-control-core/server/PullRequestProvider";
import * as TestClock from "effect/testing/TestClock";
import { projectPoolKeys } from "./t3team-StandbyInterest.ts";

import * as Machines from "./t3team-CloudSessionMachine.ts";
import {
  remoteCommit,
  remoteFixture,
  remoteProjectId,
} from "../project/t3team-remoteMachine.fixtures.ts";

it.layer(NodeServices.layer)("remote cloud machines", (it) => {
  it.effect("standby interest never refreshes a cold or expired remote cache", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({
        files: { ".devcontainer.json": '{"image":"node:24"}' },
      });
      yield* Effect.gen(function* () {
        expect(yield* projectPoolKeys).toEqual([]);
        expect(fixture.commands).toEqual([]);
        const machines = yield* Machines.CloudSessionMachines;
        // Setup resolution discovers the existing definition before it needs credentials.
        yield* machines.resolveSetup(remoteProjectId).pipe(Effect.result);
        const reads = fixture.reads.length;
        expect(yield* projectPoolKeys).toEqual(["acme.api"]);
        yield* TestClock.adjust("10 minutes");
        expect(yield* projectPoolKeys).toEqual(["acme.api"]);
        expect(fixture.commands).toHaveLength(1);
        expect(fixture.reads).toHaveLength(reads);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Machines.layer.pipe(
              Layer.provide(
                Layer.mergeAll(
                  fixture.layer,
                  fixture.dependencies,
                  Layer.mock(GitHubApi.GitHubApi)({}),
                ),
              ),
            ),
            fixture.dependencies,
          ),
        ),
      );
    }),
  );
  it.effect("keeps the linked pointer pool after HEAD expiry over the local devcontainer", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({
        gitOutput: (command) =>
          command.operation === "machine.origin"
            ? "https://nexplore.ghe.com/acme/api.git"
            : `${remoteCommit}\tHEAD\n`,
        localFiles: {
          ".git/HEAD": "ref: refs/heads/main",
          ".devcontainer.json": '{"image":"local"}',
        },
        files: {
          ".nexi/machine.json": '{"version":1,"devcontainer":".devcontainer.json"}',
          ".devcontainer.json": '{"image":"remote"}',
        },
        manifest: (root) =>
          JSON.stringify({
            linkedRepositories: [
              {
                url: "https://nexplore.ghe.com/acme/linked.git",
                localPath: `${root}/missing`,
                status: "not-cloned",
              },
            ],
          }),
      });
      yield* Effect.gen(function* () {
        const machines = yield* Machines.CloudSessionMachines;
        const machine = yield* machines.resolve(remoteProjectId);
        expect(machine?.repository.name).toBe("linked");
        const commands = fixture.commands.length;
        const reads = fixture.reads.length;
        yield* TestClock.adjust("10 minutes");
        expect(yield* projectPoolKeys).toEqual(["acme.linked"]);
        expect(fixture.commands).toHaveLength(commands);
        expect(fixture.reads).toHaveLength(reads);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Machines.layer.pipe(
              Layer.provide(
                Layer.mergeAll(
                  fixture.layer,
                  fixture.dependencies,
                  Layer.mock(GitHubApi.GitHubApi)({
                    credential: () =>
                      Effect.succeed({ token: Redacted.make("token"), fingerprint: "test" }),
                    rest: () =>
                      Effect.succeed({
                        status: 200,
                        headers: {},
                        body: '{"login":"pj","id":7}',
                        truncated: false,
                        invalidUtf8: false,
                      }),
                  }),
                ),
              ),
            ),
            fixture.dependencies,
          ),
        ),
      );
    }),
  );
  it.effect.each([
    { gitExitCode: 128 },
    { gitOutput: "" },
    { gitOutput: "ref: refs/heads/main\tHEAD\n" },
    { gitTruncated: true },
    {
      gitError: new VcsProcessTimeoutError({
        operation: "test",
        command: "git",
        cwd: ".",
        timeoutMs: 15000,
      }),
    },
    ...(["unauthenticated", "failed", "rate-limited"] as const).map((reason) => ({
      readError: new PullRequestProviderError({
        provider: SourceControlProviderKind.make("github"),
        operation: "readFileAtRevision",
        reason,
        detail: "test",
      }),
    })),
  ])("starts a plain session when remote discovery is unavailable: %#", (input) =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture(input);
      const result = yield* Machines.CloudSessionMachines.pipe(
        Effect.flatMap((machines) =>
          Effect.gen(function* () {
            expect(yield* machines.resolve(remoteProjectId)).toBeNull();
            return yield* machines.resolvePlain(remoteProjectId);
          }),
        ),
        Effect.provide(
          Layer.mergeAll(
            Machines.layer.pipe(
              Layer.provide(
                Layer.mergeAll(
                  fixture.layer,
                  fixture.dependencies,
                  Layer.mock(GitHubApi.GitHubApi)({}),
                ),
              ),
            ),
            fixture.dependencies,
          ),
        ),
      );
      expect(result.kind).toBe("workspace");
      expect(fixture.commands).toHaveLength(1);
    }),
  );

  it.effect("rejects a fetched invalid definition", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files: { ".nexi/machine.json": "invalid" } });
      const error = yield* Machines.CloudSessionMachines.pipe(
        Effect.flatMap((machines) => machines.resolve(remoteProjectId)),
        Effect.provide(
          Layer.mergeAll(
            Machines.layer.pipe(
              Layer.provide(
                Layer.mergeAll(
                  fixture.layer,
                  fixture.dependencies,
                  Layer.mock(GitHubApi.GitHubApi)({}),
                ),
              ),
            ),
            fixture.dependencies,
          ),
        ),
        Effect.flip,
      );
      expect(error.message).toContain(".nexi/machine.json cannot be used");
    }),
  );
  it.effect.each([remoteCommit, "b".repeat(64)])(
    "starts with scanned SHA %s and user credentials without local git checks",
    (commit) =>
      Effect.gen(function* () {
        const fixture = yield* remoteFixture({
          gitOutput: `${commit}\tHEAD\n`,
          files: {
            ".nexi/machine.json": JSON.stringify({
              version: 1,
              devcontainer: ".devcontainer/api/devcontainer.json",
              healthCheck: "node --version",
              secrets: [{ name: "NPM_TOKEN", scope: "team" }],
            }),
            ".devcontainer/api/devcontainer.json": '{"image":"node:24"}',
          },
        });
        const api = Layer.mock(GitHubApi.GitHubApi)({
          credential: () =>
            Effect.succeed({ token: Redacted.make("user-token"), fingerprint: "test" }),
          rest: () =>
            Effect.succeed({
              status: 200,
              headers: {},
              body: JSON.stringify({ login: "pj", id: 7, name: "Philip", email: null }),
              truncated: false,
              invalidUtf8: false,
            }),
        });
        const layer = Machines.layer.pipe(
          Layer.provide(Layer.mergeAll(fixture.layer, fixture.dependencies, api)),
        );
        const result = yield* Machines.CloudSessionMachines.pipe(
          Effect.flatMap((machines) =>
            Effect.all([machines.resolve(remoteProjectId), machines.poolKeyOf(remoteProjectId)]),
          ),
          Effect.provide(
            Layer.mergeAll(
              layer,
              ConfigProvider.layer(
                ConfigProvider.fromEnv({ env: { NEXI_FF_CLOUD_PROJECT_MACHINE: "1" } }),
              ),
            ),
          ),
        );
        expect(result[0]).toMatchObject({
          commit,
          token: "user-token",
          devcontainerPath: ".devcontainer/api/devcontainer.json",
          healthCheck: "node --version",
          teamSecretNames: ["NPM_TOKEN"],
          repository: { host: "nexplore.ghe.com", owner: "acme", name: "api" },
        });
        expect(result[1]).toBe("acme.api");
        expect(fixture.commands.map((command) => command.args[0])).toEqual(["ls-remote"]);
        expect(fixture.reads.every((read) => read.revision === result[0]?.commit)).toBe(true);
      }),
  );
});
