import { assert, it } from "@effect/vitest";
import * as NodeOS from "node:os";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import * as ServerConfig from "./config.ts";
import { ingestProjectSourceIcon } from "./t3team-projectSourceIconIngest.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

const atlassianSource: {
  readonly provider: "atlassian";
  readonly accountId: string;
  readonly externalProjectId: string;
} = {
  provider: "atlassian",
  accountId: "account-1",
  externalProjectId: "11816",
};

const fakeProvider = {
  listProjects: async () => [
    {
      id: "11816",
      iconUrl:
        "https://example.atlassian.net/rest/api/3/universal_avatar/view/type/project/avatar/1",
    },
    {
      id: "10008",
      iconUrl:
        "https://example.atlassian.net/rest/api/3/universal_avatar/view/type/project/avatar/2",
    },
  ],
  downloadAsset: async () => ({
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    mimeType: "image/png",
  }),
};

const stateDir = `${NodeOS.tmpdir()}/psicon-${t3teamRandomUUID()}`;

it.layer(NodeServices.layer)("project source icon ingest", (it) => {
  it.effect("stores the Jira avatar under stateDir/project-icons and returns the path", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const target = yield* ingestProjectSourceIcon({
        projectId: "project-psicon-a",
        source: atlassianSource,
        provider: fakeProvider,
      }).pipe(Effect.provideService(ServerConfig.ServerConfig, { stateDir } as never));
      if (target === null) throw new Error("expected the ingest to store the avatar");
      assert.strictEqual(target, `${stateDir}/project-icons/project-psicon-a.png`);
      const bytes = yield* fileSystem.readFile(target);
      assert.deepStrictEqual(Array.from(bytes.slice(0, 4)), [137, 80, 78, 71]);
    }),
  );

  it.effect("returns null when the provider fails", () =>
    Effect.gen(function* () {
      const failingProvider = {
        listProjects: async () => {
          throw new Error("no network");
        },
        downloadAsset: async () => {
          throw new Error("unreachable");
        },
      };
      const target = yield* ingestProjectSourceIcon({
        projectId: "project-psicon-b",
        source: atlassianSource,
        provider: failingProvider,
      }).pipe(Effect.provideService(ServerConfig.ServerConfig, { stateDir } as never));
      assert.strictEqual(target, null);
    }),
  );

  it.effect("returns null when the bound project has no avatar url", () =>
    Effect.gen(function* () {
      const noIconProvider = {
        listProjects: async () => [{ id: "11816" }],
        downloadAsset: async () => ({ bytes: new Uint8Array([1]) }),
      };
      const target = yield* ingestProjectSourceIcon({
        projectId: "project-psicon-c",
        source: atlassianSource,
        provider: noIconProvider,
      }).pipe(Effect.provideService(ServerConfig.ServerConfig, { stateDir } as never));
      assert.strictEqual(target, null);
    }),
  );
});
