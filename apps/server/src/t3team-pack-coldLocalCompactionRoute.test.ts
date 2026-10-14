// @effect-diagnostics preferSchemaOverJson:off - pack manifest fixtures are intentionally compact JSON.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { afterEach } from "vite-plus/test";

import {
  getPackColdLocalCompactionRoute,
  loadPackColdLocalCompactionRoutes,
  setPackColdLocalCompactionRoutes,
} from "./t3team-pack-coldLocalCompactionRoute.ts";
import { inspectConfiguredWorkspacePacks } from "./t3team-pack-host.ts";

const nodeLayer = it.layer(NodeServices.layer);

const route = {
  driver: "claudeAgent",
  ttlMs: 300_000,
  minUsedTokens: 100_000,
  localProviderInstance: "example",
  localModel: "medium",
  enabled: true,
};

const writePack = (input: {
  readonly capabilities: ReadonlyArray<string>;
  readonly routes: ReadonlyArray<unknown>;
}) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-pack-cold-" });
    const directory = path.join(root, "example");
    yield* fileSystem.makeDirectory(directory);
    yield* fileSystem.writeFileString(
      path.join(directory, "activate.mjs"),
      `export const activate = ({ defineColdLocalCompactionRoute }) => { for (const route of ${JSON.stringify(input.routes)}) defineColdLocalCompactionRoute(route); };`,
    );
    yield* fileSystem.writeFileString(
      path.join(directory, "pack.json"),
      JSON.stringify({
        id: "example",
        name: "Example",
        packApiVersion: 1,
        version: "1.0.0",
        scope: "distribution",
        compatibility: { t3teamCore: "*" },
        contents: {},
        capabilities: input.capabilities,
        entrypoints: { activate: "activate.mjs" },
        hashes: {},
      }),
    );
    return yield* Effect.tryPromise(() => inspectConfiguredWorkspacePacks(root));
  });

const load = (diagnostic: Awaited<ReturnType<typeof inspectConfiguredWorkspacePacks>>) =>
  Effect.tryPromise(() => loadPackColdLocalCompactionRoutes(diagnostic));

afterEach(() => setPackColdLocalCompactionRoutes([]));

nodeLayer("pack cold local compaction routes", (it) => {
  it.effect("loads pack-registered routes behind their capability", () =>
    Effect.gen(function* () {
      const diagnostic = yield* writePack({
        capabilities: ["cold-local-compaction:v1"],
        routes: [route],
      });
      expect(yield* load(diagnostic)).toEqual([route]);
    }),
  );

  it.effect("rejects a route from a pack without the capability", () =>
    Effect.gen(function* () {
      const diagnostic = yield* writePack({ capabilities: [], routes: [route] });
      expect((yield* Effect.exit(load(diagnostic)))._tag).toBe("Failure");
    }),
  );

  it.effect("rejects a route that names no local model or has a negative threshold", () =>
    Effect.gen(function* () {
      for (const invalid of [
        { ...route, localModel: " " },
        { ...route, minUsedTokens: -1 },
      ]) {
        const diagnostic = yield* writePack({
          capabilities: ["cold-local-compaction:v1"],
          routes: [invalid],
        });
        expect((yield* Effect.exit(load(diagnostic)))._tag).toBe("Failure");
      }
    }),
  );
});

it("serves the installed route by driver, and nothing for other drivers", () => {
  expect(getPackColdLocalCompactionRoute("claudeAgent")).toBeUndefined();

  setPackColdLocalCompactionRoutes([route]);
  expect(getPackColdLocalCompactionRoute("claudeAgent")).toEqual(route);
  expect(getPackColdLocalCompactionRoute("codex")).toBeUndefined();

  setPackColdLocalCompactionRoutes([]);
  expect(getPackColdLocalCompactionRoute("claudeAgent")).toBeUndefined();
});

it("refuses two routes for one driver", () => {
  expect(() => setPackColdLocalCompactionRoutes([route, { ...route, localModel: "high" }])).toThrow(
    /Multiple cold local compaction routes/,
  );
});
