/**
 * t3team: a pack/declarative OpenCode config (`OpenCodeSettings.configContent`) reaches the
 * OpenCode server a V2 session connects to, so a spawned server runs with the pack's providers.
 */
import { assert, it } from "@effect/vitest";
import { ProviderInstanceId, ProviderSessionId, ThreadId } from "@t3tools/contracts";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import { ProviderAdapterV2RuntimePolicy } from "@t3tools/provider-core/server/ProviderAdapter";
import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { OpenCodeSettings } from "../settings.ts";
import { makeOpenCodeAdapterV2 } from "./adapter.ts";
import * as OpenCodeRuntime from "./OpenCodeRuntime.ts";

type ConnectInput = Parameters<OpenCodeRuntime.OpenCodeRuntimeShape["connectToOpenCodeServer"]>[0];

const decodeSettings = Schema.decodeSync(OpenCodeSettings);

const openWith = (configContent: string) => {
  const settings = decodeSettings({ configContent });
  return Effect.gen(function* () {
    const instanceId = ProviderInstanceId.make("opencode-config");
    const connects: Array<ConnectInput> = [];
    const adapter = yield* makeOpenCodeAdapterV2({
      instanceId,
      settings,
      environment: {},
    }).pipe(
      Effect.provideService(OpenCodeRuntime.OpenCodeRuntime, {
        connectToOpenCodeServer: (input: ConnectInput) => {
          connects.push(input);
          // Stop right after the connect request: only its input is under test.
          return Effect.fail(
            new OpenCodeRuntime.OpenCodeRuntimeError({
              operation: "connect",
              detail: "test stops here",
            }),
          );
        },
      } as unknown as OpenCodeRuntime.OpenCodeRuntime["Service"]),
      Effect.provideService(ProviderHost.ProviderHost, {
        paths: { cwd: "/workspace" },
        resolveAttachmentPath: () => null,
      } as unknown as ProviderHost.ProviderHost["Service"]),
    );
    const exit = yield* Effect.exit(
      adapter.openSession({
        threadId: ThreadId.make("thread-opencode-config"),
        providerSessionId: ProviderSessionId.make("session-opencode-config"),
        modelSelection: { instanceId, model: "example/model" },
        runtimePolicy: ProviderAdapterV2RuntimePolicy.make({
          runtimeMode: "full-access",
          interactionMode: "default",
          cwd: "/workspace",
        }),
      }),
    );
    assert.isTrue(Exit.isFailure(exit));
    return connects;
  }).pipe(Effect.provide(Layer.merge(IdAllocator.layer, McpProviderSessions.layer)), Effect.scoped);
};

it.effect("forwards the configured OpenCode config content when a session connects", () =>
  Effect.gen(function* () {
    const connects = yield* openWith('{"provider":{}}');
    assert.lengthOf(connects, 1);
    assert.equal(connects[0]?.configContent, '{"provider":{}}');
    assert.equal(connects[0]?.directory, "/workspace");
  }),
);

it.effect("leaves the user's own OpenCode config alone when none is configured", () =>
  Effect.gen(function* () {
    const connects = yield* openWith("  ");
    assert.lengthOf(connects, 1);
    assert.isFalse(connects[0] !== undefined && "configContent" in connects[0]);
  }),
);
