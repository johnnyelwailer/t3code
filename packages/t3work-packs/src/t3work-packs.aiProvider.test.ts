import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  decodeAiProviderDefinition,
  decodeWorkspacePackManifest,
  loadManifestAiProviders,
} from "./t3work-packs.index.ts";

const provider = {
  schemaVersion: 1 as const,
  id: "nexi-opencode",
  driver: "nexi" as const,
  harness: "opencode" as const,
  displayName: "Nexi",
  accent: "#6842ff",
  credentialEnv: "NEXI_API_KEY",
  modelDiscovery: "configured" as const,
  modelSelection: "user" as const,
  configuration: {
    kind: "upstream-provider" as const,
    provider: {
      id: "nexi",
      name: "Nexi Gateway",
      baseURL: "https://ai.example.test/v1",
      api: "responses" as const,
      models: [{ id: "gpt-5", name: "GPT-5" }],
    },
  },
};

describe("AI provider definition", () => {
  it("accepts a declarative OpenCode upstream provider", () => {
    expect(decodeAiProviderDefinition(provider).configuration.kind).toBe("upstream-provider");
  });

  it("rejects unsafe identifiers, URLs, credentials, and drivers", () => {
    expect(() => decodeAiProviderDefinition({ ...provider, id: "../nexi" })).toThrow();
    expect(() =>
      decodeAiProviderDefinition({
        ...provider,
        configuration: {
          ...provider.configuration,
          provider: { ...provider.configuration.provider, baseURL: "file:///secret" },
        },
      }),
    ).toThrow();
    expect(() => decodeAiProviderDefinition({ ...provider, credentialEnv: "bad-name" })).toThrow();
    expect(() => decodeAiProviderDefinition({ ...provider, harness: "shell" })).toThrow();
  });

  it("loads a matching manifest asset and blocks traversal", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3work-provider-"));
    try {
      await NodeFSP.writeFile(NodePath.join(root, "provider.json"), JSON.stringify(provider));
      const base = {
        id: "pack",
        version: "1.0.0",
        packApiVersion: 1 as const,
        name: "Pack",
        compatibility: { t3workCore: "0.x" },
        capabilities: [],
        hashes: {},
      };
      const manifest = decodeWorkspacePackManifest({
        ...base,
        contents: { aiProviders: [{ id: provider.id, path: "provider.json" }] },
      });
      await expect(loadManifestAiProviders(root, manifest)).resolves.toMatchObject([
        { id: "nexi-opencode", driver: "nexi", harness: "opencode" },
      ]);

      const escaped = decodeWorkspacePackManifest({
        ...base,
        contents: { aiProviders: [{ id: provider.id, path: "../provider.json" }] },
      });
      await expect(loadManifestAiProviders(root, escaped)).rejects.toThrow(/escapes/);
    } finally {
      await NodeFSP.rm(root, { recursive: true });
    }
  });
});
