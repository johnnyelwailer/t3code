import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";

import * as Machines from "./t3team-CloudSessionMachine.ts";
import {
  remoteCommit,
  remoteFixture,
  remoteProjectId,
} from "../project/t3team-remoteMachineTestUtils.ts";

it.layer(NodeServices.layer)("remote cloud machines", (it) => {
  it.effect("starts with the exact scanned SHA and user credentials without local git checks", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({
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
        commit: remoteCommit,
        token: "user-token",
        devcontainerPath: ".devcontainer/api/devcontainer.json",
        healthCheck: "node --version",
        teamSecretNames: ["NPM_TOKEN"],
        repository: { host: "nexplore.ghe.com", owner: "acme", name: "api" },
      });
      expect(result[1]).toBe("acme.api");
      expect(fixture.commands.map((command) => command.args[0])).toEqual([
        "ls-remote",
        "ls-remote",
      ]);
      expect(fixture.reads.every((read) => read.revision === result[0]?.commit)).toBe(true);
    }),
  );
});
