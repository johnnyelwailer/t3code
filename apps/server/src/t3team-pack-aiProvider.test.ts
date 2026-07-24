import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  openCodeUpstreamConfigContent,
  packAiProvidersToInstanceConfigMap,
} from "./t3team-pack-aiProvider.ts";
import { loadPackProviderOverlay } from "./t3team-pack-host.ts";

const upstream = {
  id: "nexplore",
  name: "Nexplore Gateway",
  baseURL: "https://ai.example.test/v1",
  api: "chat-completions",
  models: [{ id: "coding", name: "Coding" }],
} as const;

it("emits a top-level default model only when defaultModel is provided", () => {
  expect(JSON.parse(openCodeUpstreamConfigContent({ provider: upstream }))).not.toHaveProperty(
    "model",
  );
  const withDefault = JSON.parse(
    openCodeUpstreamConfigContent({ provider: upstream, defaultModel: "coding" }),
  );
  expect(withDefault.model).toBe("nexplore/coding");
});

it("maps pack provider data to an isolated OpenCode instance", () => {
  const result = packAiProvidersToInstanceConfigMap([
    {
      schemaVersion: 1,
      id: "nexi",
      driver: "nexi",
      harness: "opencode",
      displayName: "Nexi",
      accent: "#112233",
      iconDataUrl: "data:image/png;base64,aWNvbg==",
      credentialEnv: "NEXI_API_KEY",
      configuration: {
        kind: "upstream-provider",
        provider: {
          id: "nexplore",
          name: "Nexplore Gateway",
          baseURL: "https://ai.example.test/v1",
          api: "chat-completions",
          models: [{ id: "coding", name: "Coding" }],
        },
      },
    },
  ]);

  const instance = Object.values(result)[0]!;
  expect(instance.driver).toBe("nexi");
  expect(instance.displayName).toBe("Nexi");
  expect(instance.iconDataUrl).toBe("data:image/png;base64,aWNvbg==");
  expect(instance.config).toMatchObject({ customModels: ["nexplore/coding"] });
  expect(JSON.parse((instance.config as { configContent: string }).configContent)).toEqual({
    provider: {
      nexplore: {
        npm: "@ai-sdk/openai-compatible",
        name: "Nexplore Gateway",
        options: {
          baseURL: "https://ai.example.test/v1",
          apiKey: "{env:NEXI_API_KEY}",
        },
        models: { coding: { name: "Coding" } },
      },
    },
  });
});

it("rejects provider assets without the declared host capability", async () => {
  await expect(
    loadPackProviderOverlay({
      enabled: true,
      issues: [],
      resolution: {
        packs: [
          {
            directory: "/unused",
            manifest: {
              id: "unsafe",
              version: "1.0.0",
              packApiVersion: 1,
              name: "Unsafe",
              compatibility: { t3teamCore: "0.x" },
              contents: { aiProviders: [{ id: "unsafe", path: "provider.json" }] },
              capabilities: [],
              hashes: {},
            },
          },
        ],
        locks: {},
        diagnostics: [],
      },
    }),
  ).rejects.toThrow("without an ai-provider capability");
});

const nodeLayer = it.layer(NodeServices.layer);

nodeLayer("pack AI provider activation", (it) => {
  it.effect("loads provider definitions from a trusted pack activation module", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-pack-provider-" });
      const directory = path.join(root, "code-pack");
      yield* fileSystem.makeDirectory(directory);
      yield* fileSystem.writeFileString(
        path.join(directory, "activate.mjs"),
        `export default ({ defineAgentProvider }) => defineAgentProvider({
      schemaVersion: 1, id: "code-provider", driver: "code-provider", harness: "opencode",
      displayName: "Code Provider", accent: "#123456", modelDiscovery: "configured",
      modelSelection: "fixed", defaultModel: "coding", configuration: {
        kind: "upstream-provider", provider: { id: "gateway", name: "Gateway",
          baseURL: "https://example.test/v1", api: "chat-completions", models: [{ id: "coding", name: "Coding" }] }
      }
    })`,
      );
      const result = yield* Effect.tryPromise(() =>
        loadPackProviderOverlay({
          enabled: true,
          issues: [],
          resolution: {
            packs: [
              {
                directory,
                manifest: {
                  id: "code-pack",
                  version: "1.0.0",
                  packApiVersion: 1,
                  name: "Code",
                  compatibility: { t3teamCore: "*" },
                  contents: {},
                  entrypoints: { activate: "activate.mjs" },
                  capabilities: ["ai-provider:code-provider"],
                  hashes: {},
                },
              },
            ],
            locks: {},
            diagnostics: [],
          },
        }),
      );
      expect(Object.values(result.configMap)[0]?.displayName).toBe("Code Provider");
    }),
  );
});
