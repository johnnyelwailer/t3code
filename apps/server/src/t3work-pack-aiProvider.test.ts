import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { expect, it } from "@effect/vitest";

import { packAiProvidersToInstanceConfigMap } from "./t3work-pack-aiProvider.ts";
import { loadPackProviderOverlay } from "./t3work-pack-host.ts";

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
              compatibility: { t3workCore: "0.x" },
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

it("loads provider definitions from a trusted pack activation module", async () => {
  const root = await NodeFSP.mkdtemp("/tmp/t3work-pack-provider-");
  const directory = NodePath.join(root, "code-pack");
  await NodeFSP.mkdir(directory);
  await NodeFSP.writeFile(
    NodePath.join(directory, "activate.mjs"),
    `export default ({ defineAgentProvider }) => defineAgentProvider({
      schemaVersion: 1, id: "code-provider", driver: "code-provider", harness: "opencode",
      displayName: "Code Provider", accent: "#123456", modelDiscovery: "configured",
      modelSelection: "fixed", defaultModel: "coding", configuration: {
        kind: "upstream-provider", provider: { id: "gateway", name: "Gateway",
          baseURL: "https://example.test/v1", api: "chat-completions", models: [{ id: "coding", name: "Coding" }] }
      }
    })`,
  );
  const result = await loadPackProviderOverlay({
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
            compatibility: { t3workCore: "*" },
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
  });
  expect(Object.values(result)[0]?.displayName).toBe("Code Provider");
  await NodeFSP.rm(root, { recursive: true });
});
