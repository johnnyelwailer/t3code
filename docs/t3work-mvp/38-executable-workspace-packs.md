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

## Executable provider drivers (`defineProviderDriver`)

`defineAgentProvider` is data-only: the host runs its fixed OpenCode harness against pack-supplied config. When a pack needs to own the live session lifecycle — config/auth/model policy, session start/turn/interrupt, event normalization, reconnect — it registers an **executable driver** with `defineProviderDriver`.

The driver contract is Promise / AsyncIterable based (no Effect types leak into the pack SDK); the host bridges each method into its internal driver SPI. `resumeCursor` stays opaque end to end so reconnect keeps working.

```js
export default async ({ defineProviderDriver }) => {
  defineProviderDriver({
    schemaVersion: 1,
    driver: "nexplore",
    displayName: "Nexplore",
    async create({ instanceId, config, environment, host }) {
      // Compose and decorate the reviewed host OpenCode harness…
      const harness = await host.createOpenCodeHarness({
        provider: {
          /* same upstream-provider shape as defineAgentProvider */
        },
        defaultModel: "qwen3.6-35b-a3b-q6-192k:nothink",
        credentialEnv: "NEXPLORE_API_KEY",
      });
      // …or return a fully custom PackProviderInstance
      // (snapshot/startSession/sendTurn/…/events()/dispose()).
      return harness;
    },
  });
};
```

- **Capability gate.** Registering a driver requires a `provider-driver:<id>` capability in the manifest (peer to `ai-provider:<id>`); the id must not collide with a built-in or another pack's driver, or activation fails.

  ```json
  { "capabilities": ["provider-driver:nexplore"] }
  ```

- **`host.createOpenCodeHarness(options)`** returns a `PackProviderInstance` backed by the reviewed host OpenCode runtime, which the pack can wrap (retry `startSession`, normalize `events()`) while owning config/auth/model policy. `defaultModel` is emitted as the OpenCode default model.

- **Driver-only packs are valid.** A pack may register a driver without any `defineAgentProvider`; the instances that use it come from user settings (`providerInstances`) referencing the driver id. A `defineAgentProvider` entry with a matching driver id is bridged to the executable driver automatically, and data-only providers keep falling back to the OpenCode harness.

- **Lifecycle.** The bridged event stream is tied to the instance scope (it ends on teardown), and the pack's `dispose()` is bounded by a timeout so a hung teardown cannot stall reconcile. Undecodable events are dropped and logged; an undecodable event carrying both `threadId` and `turnId` is upgraded to a synthetic turn-failure so the turn does not spin forever. Text generation (commit/PR/branch/title) is not supported for executable pack drivers in v1.
