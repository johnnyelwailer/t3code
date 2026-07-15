# Executable workspace packs

Workspace packs are trusted distribution modules. The manifest describes discovery and declared capabilities; product behavior lives in the pack's ESM activation entrypoint.

```json
{
  "entrypoints": { "activate": "activate.mjs" },
  "capabilities": ["ai-provider:nexplore", "theme:v1"]
}
```

The host imports `activate` and passes a typed `PackActivationContext`. A pack can define an agent provider and theme, and resolve local assets such as logos:

```js
export default async ({ defineAgentProvider, resolveAssetDataUrl }) => {
  defineAgentProvider({
    id: "nexplore",
    driver: "nexplore",
    harness: "opencode",
    defaultModel: "qwen3.6-35b-a3b-q6-192k:nothink",
    iconDataUrl: await resolveAssetDataUrl("assets/nexplore-mark.png", "image/png"),
    configuration: {
      kind: "upstream-provider",
      provider: {
        /* ... */
      },
    },
  });
};
```

This removes provider behavior from content JSON. The same activation boundary is the extension point for future `defineView`, `defineConnector`, `defineTool`, and persistence providers. Packs are fully trusted in v1; the host still confines asset resolution to the pack directory and checks declared capabilities.
