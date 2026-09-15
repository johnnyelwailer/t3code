import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "./config.ts";
import {
  loadPersistedAtlassianAuthsPayload,
  savePersistedAtlassianAuthsPayload,
} from "./t3team-atlassian-auth-persistence.ts";

function testLayer(prefix: string) {
  return Layer.mergeAll(
    NodeServices.layer,
    ServerConfig.layerTest(process.cwd(), { prefix }).pipe(Layer.provide(NodeServices.layer)),
  );
}

const LEGACY_VERSION_1_FILE = JSON.stringify({
  version: 1,
  auths: [
    {
      accountId: "cloud-1",
      auth: {
        kind: "oauth",
        cloudId: "cloud-1",
        siteUrl: "https://example.atlassian.net",
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: 1,
      },
    },
    {
      accountId: "basic-1",
      auth: { kind: "basic", siteUrl: "https://b.atlassian.net", email: "a@b.c", apiToken: "t" },
    },
  ],
});

it.effect("decodes version-1 files written before the needsReconnect flag existed", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { secretsDir } = yield* ServerConfig.ServerConfig;
    yield* fileSystem.makeDirectory(secretsDir, { recursive: true });
    yield* fileSystem.writeFileString(
      path.join(secretsDir, "t3team-atlassian-auths.bin"),
      LEGACY_VERSION_1_FILE,
    );

    const loaded = yield* loadPersistedAtlassianAuthsPayload;

    assert.deepEqual(
      loaded?.auths.map((entry) => [entry.accountId, entry.needsReconnect]),
      [
        ["cloud-1", undefined],
        ["basic-1", undefined],
      ],
    );
  }).pipe(Effect.provide(testLayer("t3team-atlassian-auth-persistence-legacy-"))),
);

it.effect("round-trips the needsReconnect flag without bumping the file version", () =>
  Effect.gen(function* () {
    yield* savePersistedAtlassianAuthsPayload({
      version: 1,
      auths: [
        {
          accountId: "cloud-1",
          auth: { kind: "oauth", cloudId: "cloud-1", accessToken: "access" },
          needsReconnect: true,
        },
        { accountId: "cloud-2", auth: { kind: "oauth", cloudId: "cloud-2", accessToken: "a2" } },
      ],
    });

    const loaded = yield* loadPersistedAtlassianAuthsPayload;

    assert.equal(loaded?.version, 1);
    assert.deepEqual(
      loaded?.auths.map((entry) => [entry.accountId, entry.needsReconnect]),
      [
        ["cloud-1", true],
        ["cloud-2", undefined],
      ],
    );
  }).pipe(Effect.provide(testLayer("t3team-atlassian-auth-persistence-roundtrip-"))),
);
