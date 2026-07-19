// @effect-diagnostics preferSchemaOverJson:off - pack manifest fixtures are intentionally compact JSON.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  inspectConfiguredWorkspacePacks,
  loadPackAppearanceOverlay,
  loadPackWorkflowAgentModelPolicy,
  loadPackWorkflowEphemeralConcurrencyPolicy,
  loadPackWorkflowRepairPolicy,
} from "./t3work-pack-host.ts";

const nodeLayer = it.layer(NodeServices.layer);

nodeLayer("workspace pack host inspection", (it) => {
  it("does nothing unless a pack root is configured", async () => {
    await expect(inspectConfiguredWorkspacePacks(undefined)).resolves.toEqual({
      enabled: false,
      issues: [],
    });
  });

  it.effect("discovers and resolves configured distribution packs", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3work-pack-host-" });
      const directory = path.join(root, "example");
      yield* fileSystem.makeDirectory(directory);
      yield* fileSystem.writeFileString(
        path.join(directory, "pack.json"),
        JSON.stringify({
          id: "example",
          name: "Example",
          packApiVersion: 1,
          version: "1.0.0",
          scope: "distribution",
          compatibility: { t3workCore: "*" },
          contents: {},
          capabilities: [],
          hashes: {},
        }),
      );

      const result = yield* Effect.tryPromise(() => inspectConfiguredWorkspacePacks(root));

      expect(result.issues).toEqual([]);
      expect(result.resolution?.packs.map((pack) => pack.manifest.id)).toEqual(["example"]);
    }),
  );

  it.effect("reports an invalid root without throwing", () =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise(() =>
        inspectConfiguredWorkspacePacks("/definitely/missing/t3work-packs"),
      );

      expect(result.enabled).toBe(true);
      expect(result.resolution).toBeUndefined();
      expect(result.issues[0]?.directory).toBe("/definitely/missing/t3work-packs");
    }),
  );

  it.effect("loads a reviewed active theme from the resolved pack", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3work-pack-theme-" });
      const directory = path.join(root, "theme-pack");
      yield* fileSystem.makeDirectory(path.join(directory, "themes"), { recursive: true });
      yield* fileSystem.writeFileString(
        path.join(directory, "themes/theme.json"),
        JSON.stringify({
          schemaVersion: 1,
          id: "nexplore",
          name: "Nexplore",
          labels: { appName: "Nexi" },
          colors: { light: { primary: "#f05a00" }, dark: { primary: "#ff6a0a" } },
        }),
      );
      yield* fileSystem.writeFileString(
        path.join(directory, "pack.json"),
        JSON.stringify({
          id: "theme-pack",
          name: "Theme",
          packApiVersion: 1,
          version: "1.0.0",
          scope: "distribution",
          compatibility: { t3workCore: "*" },
          contents: { themes: [{ id: "nexplore", path: "themes/theme.json" }] },
          capabilities: ["theme:v1"],
          hashes: {},
        }),
      );
      const diagnostic = yield* Effect.tryPromise(() => inspectConfiguredWorkspacePacks(root));
      const appearance = yield* Effect.tryPromise(() => loadPackAppearanceOverlay(diagnostic));
      expect(appearance).toMatchObject({
        themeId: "nexplore",
        labels: { appName: "Nexi" },
      });
    }),
  );

  it.effect("loads Nexi's three-attempt Nexplore repair policy from the pack activation", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3work-pack-repair-" });
      const directory = path.join(root, "nexi");
      yield* fileSystem.makeDirectory(directory);
      yield* fileSystem.writeFileString(
        path.join(directory, "activate.mjs"),
        'export const activate = ({ defineWorkflowRepairPolicy }) => defineWorkflowRepairPolicy({ maxAttempts: 3, modelSelection: { instanceId: "nexplore", model: "nexplore/coding" } });',
      );
      yield* fileSystem.writeFileString(
        path.join(directory, "pack.json"),
        JSON.stringify({
          id: "nexi",
          name: "Nexi",
          packApiVersion: 1,
          version: "1.0.0",
          scope: "distribution",
          compatibility: { t3workCore: "*" },
          contents: {},
          capabilities: ["workflow-repair-policy:v1"],
          entrypoints: { activate: "activate.mjs" },
          hashes: {},
        }),
      );
      const diagnostic = yield* Effect.tryPromise(() => inspectConfiguredWorkspacePacks(root));
      const policy = yield* Effect.tryPromise(() => loadPackWorkflowRepairPolicy(diagnostic));
      expect(policy).toEqual({
        maxAttempts: 3,
        modelSelection: { instanceId: "nexplore", model: "nexplore/coding" },
      });
    }),
  );

  it.effect("loads a workflow child-agent model policy from pack activation", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3work-pack-agent-model-",
      });
      const directory = path.join(root, "nexi");
      yield* fileSystem.makeDirectory(directory);
      yield* fileSystem.writeFileString(
        path.join(directory, "activate.mjs"),
        'export const activate = ({ defineWorkflowAgentModelPolicy }) => defineWorkflowAgentModelPolicy({ modelSelection: { instanceId: "nexplore", model: "nexplore/coding" } });',
      );
      yield* fileSystem.writeFileString(
        path.join(directory, "pack.json"),
        JSON.stringify({
          id: "nexi",
          name: "Nexi",
          packApiVersion: 1,
          version: "1.0.0",
          scope: "distribution",
          compatibility: { t3workCore: "*" },
          contents: {},
          capabilities: ["workflow-agent-model-policy:v1"],
          entrypoints: { activate: "activate.mjs" },
          hashes: {},
        }),
      );
      const diagnostic = yield* Effect.tryPromise(() => inspectConfiguredWorkspacePacks(root));
      const policy = yield* Effect.tryPromise(() => loadPackWorkflowAgentModelPolicy(diagnostic));
      expect(policy).toEqual({ instanceId: "nexplore", model: "nexplore/coding" });
    }),
  );

  it.effect("loads an unlimited ephemeral workflow concurrency policy", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3work-pack-concurrency-",
      });
      const directory = path.join(root, "nexi");
      yield* fileSystem.makeDirectory(directory);
      yield* fileSystem.writeFileString(
        path.join(directory, "activate.mjs"),
        "export const activate = ({ defineWorkflowEphemeralConcurrencyPolicy }) => defineWorkflowEphemeralConcurrencyPolicy({ maxActiveSteps: 16 });",
      );
      yield* fileSystem.writeFileString(
        path.join(directory, "pack.json"),
        JSON.stringify({
          id: "nexi",
          name: "Nexi",
          packApiVersion: 1,
          version: "1.0.0",
          scope: "distribution",
          compatibility: { t3workCore: "*" },
          contents: {},
          capabilities: ["workflow-ephemeral-concurrency-policy:v1"],
          entrypoints: { activate: "activate.mjs" },
          hashes: {},
        }),
      );
      const diagnostic = yield* Effect.tryPromise(() => inspectConfiguredWorkspacePacks(root));
      const policy = yield* Effect.tryPromise(() =>
        loadPackWorkflowEphemeralConcurrencyPolicy(diagnostic),
      );
      expect(policy).toEqual({ maxActiveSteps: 16 });
    }),
  );
});
