import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { loadPackProviderOverlay } from "./t3team-pack-host.ts";

const writePack = (input: {
  readonly id: string;
  readonly capabilities: readonly string[];
  readonly activate: string;
}) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-pack-driver-" });
    const directory = path.join(root, input.id);
    yield* fileSystem.makeDirectory(directory);
    yield* fileSystem.writeFileString(path.join(directory, "activate.mjs"), input.activate);
    return {
      directory,
      manifest: {
        id: input.id,
        version: "1.0.0",
        packApiVersion: 1,
        name: input.id,
        compatibility: { t3teamCore: "*" },
        contents: {},
        entrypoints: { activate: "activate.mjs" },
        capabilities: input.capabilities,
        hashes: {},
      },
    };
  });

const DRIVER_ACTIVATE = (driver: string) =>
  `export default ({ defineProviderDriver }) => defineProviderDriver({
    schemaVersion: 1, driver: ${JSON.stringify(driver)}, displayName: "Driver ${driver}",
    create: async () => ({})
  });`;

const overlayInput = (
  packs: ReadonlyArray<{ directory: string; manifest: Record<string, unknown> }>,
) =>
  ({
    enabled: true,
    issues: [],
    resolution: { packs, locks: {}, diagnostics: [] },
  }) as unknown as Parameters<typeof loadPackProviderOverlay>[0];

const nodeLayer = it.layer(NodeServices.layer);

nodeLayer("loadPackProviderOverlay provider drivers", (it) => {
  it.effect("collects an executable driver definition with the declared capability", () =>
    Effect.gen(function* () {
      const pack = yield* writePack({
        id: "nexipack",
        capabilities: ["provider-driver:nexidriver"],
        activate: DRIVER_ACTIVATE("nexidriver"),
      });
      const overlay = yield* Effect.tryPromise(() => loadPackProviderOverlay(overlayInput([pack])));
      expect(overlay.driverDefinitions.has("nexidriver")).toBe(true);
      expect(overlay.driverDefinitions.get("nexidriver")?.displayName).toBe("Driver nexidriver");
    }),
  );

  it.effect("rejects a driver registered without its provider-driver capability", () =>
    Effect.gen(function* () {
      const pack = yield* writePack({
        id: "nocap",
        capabilities: [],
        activate: DRIVER_ACTIVATE("nexidriver"),
      });
      const error = yield* Effect.tryPromise(() =>
        loadPackProviderOverlay(overlayInput([pack])),
      ).pipe(Effect.flip);
      expect(error.cause).toMatchObject({
        message: expect.stringContaining("without provider-driver:nexidriver capability"),
      });
    }),
  );

  it.effect("rejects a driver id that collides with a built-in driver", () =>
    Effect.gen(function* () {
      const pack = yield* writePack({
        id: "collide",
        capabilities: ["provider-driver:codex"],
        activate: DRIVER_ACTIVATE("codex"),
      });
      const error = yield* Effect.tryPromise(() =>
        loadPackProviderOverlay(overlayInput([pack])),
      ).pipe(Effect.flip);
      expect(error.cause).toMatchObject({
        message: expect.stringContaining("collides with a built-in driver"),
      });
    }),
  );

  it.effect("rejects duplicate driver ids across packs", () =>
    Effect.gen(function* () {
      const packA = yield* writePack({
        id: "dupa",
        capabilities: ["provider-driver:dup"],
        activate: DRIVER_ACTIVATE("dup"),
      });
      const packB = yield* writePack({
        id: "dupb",
        capabilities: ["provider-driver:dup"],
        activate: DRIVER_ACTIVATE("dup"),
      });
      const error = yield* Effect.tryPromise(() =>
        loadPackProviderOverlay(overlayInput([packA, packB])),
      ).pipe(Effect.flip);
      expect(error.cause).toMatchObject({
        message: expect.stringContaining("Duplicate provider driver id dup"),
      });
    }),
  );
});
