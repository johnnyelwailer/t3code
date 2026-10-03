// @effect-diagnostics preferSchemaOverJson:off - pack manifest fixtures are intentionally compact JSON.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { afterEach } from "vite-plus/test";

import {
  getConfiguredDefaultModelSelection,
  getConfiguredTextGenerationModelSelection,
  resetDistributionModelPolicy,
  setDistributionModelPolicy,
} from "./t3team-configuredDefaultModelSelection.ts";
import { inspectConfiguredWorkspacePacks, loadPackModelPolicy } from "./t3team-pack-host.ts";

const nodeLayer = it.layer(NodeServices.layer);

const writePack = (input: {
  readonly capabilities: ReadonlyArray<string>;
  readonly activate: string;
}) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-pack-model-" });
    const directory = path.join(root, "example");
    yield* fileSystem.makeDirectory(directory);
    yield* fileSystem.writeFileString(path.join(directory, "activate.mjs"), input.activate);
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

const POLICY_SOURCE =
  'export const activate = ({ defineModelPolicy }) => defineModelPolicy({ defaultModelSelection: { instanceId: "example", model: "example/large" }, textGenerationModelSelection: { instanceId: "example", model: "example/small" } });';

afterEach(() => resetDistributionModelPolicy());

nodeLayer("pack model policy", (it) => {
  it.effect("loads a pack-registered model policy behind its capability", () =>
    Effect.gen(function* () {
      const diagnostic = yield* writePack({
        capabilities: ["model-policy:v1"],
        activate: POLICY_SOURCE,
      });
      const policy = yield* Effect.tryPromise(() => loadPackModelPolicy(diagnostic));
      expect(policy).toEqual({
        defaultModelSelection: { instanceId: "example", model: "example/large" },
        textGenerationModelSelection: { instanceId: "example", model: "example/small" },
      });
    }),
  );

  it.effect("rejects a model policy from a pack without the capability", () =>
    Effect.gen(function* () {
      const diagnostic = yield* writePack({ capabilities: [], activate: POLICY_SOURCE });
      const exit = yield* Effect.exit(Effect.tryPromise(() => loadPackModelPolicy(diagnostic)));
      expect(exit._tag).toBe("Failure");
    }),
  );

  it.effect("rejects a selection without a model", () =>
    Effect.gen(function* () {
      const diagnostic = yield* writePack({
        capabilities: ["model-policy:v1"],
        activate:
          'export const activate = ({ defineModelPolicy }) => defineModelPolicy({ textGenerationModelSelection: { instanceId: "example" } });',
      });
      const exit = yield* Effect.exit(Effect.tryPromise(() => loadPackModelPolicy(diagnostic)));
      expect(exit._tag).toBe("Failure");
    }),
  );
});

it("falls back to the host defaults until a policy is installed", () => {
  expect(getConfiguredDefaultModelSelection("fallback-model")).toEqual({
    instanceId: "codex",
    model: "fallback-model",
  });
  expect(getConfiguredTextGenerationModelSelection()).toBeUndefined();

  setDistributionModelPolicy({
    defaultModelSelection: { instanceId: "example", model: "example/large" },
    textGenerationModelSelection: {
      instanceId: "example",
      model: "example/small",
      options: { reasoningEffort: "low" },
    },
  });
  expect(getConfiguredDefaultModelSelection("fallback-model")).toEqual({
    instanceId: "example",
    model: "example/large",
  });
  expect(getConfiguredTextGenerationModelSelection()?.model).toBe("example/small");

  resetDistributionModelPolicy();
  expect(getConfiguredTextGenerationModelSelection()).toBeUndefined();
});
