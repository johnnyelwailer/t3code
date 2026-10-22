/**
 * t3team: a pack/declarative OpenCode config (`OpenCodeSettings.configContent`) reaches the
 * OpenCode server a V2 session connects to, so a spawned server runs with the pack's providers.
 */
import { assert, it } from "@effect/vitest";
import { ProviderInstanceId, ProviderSessionId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import { ProviderAdapterV2RuntimePolicy } from "@t3tools/provider-core/server/ProviderAdapter";
import { OpenCodeSettings } from "@t3tools/provider-opencode/settings";
import * as OpenCodeRuntime from "@t3tools/provider-opencode/server/OpenCodeRuntime";
import { makeOpenCodeAdapterV2 } from "@t3tools/provider-opencode/server/adapter";

type ConnectInput = Parameters<
  OpenCodeRuntime.OpenCodeRuntime["Service"]["connectToOpenCodeServer"]
>[0];

const decodeSettings = Schema.decodeSync(OpenCodeSettings);

const instanceId = ProviderInstanceId.make("opencode-config");

const openWith = (configContent: string) => {
  const settings = decodeSettings({ configContent });
  const connects: Array<ConnectInput> = [];
  const capture = Effect.gen(function* () {
    const adapter = yield* makeOpenCodeAdapterV2({
      instanceId,
      settings,
      environment: {},
    });
    return yield* adapter.openSession({
      threadId: ThreadId.make("thread-opencode-config"),
      providerSessionId: ProviderSessionId.make("session-opencode-config"),
      modelSelection: { instanceId, model: "example/model" },
      runtimePolicy: ProviderAdapterV2RuntimePolicy.make({
        runtimeMode: "full-access",
        interactionMode: "default",
        cwd: "/workspace",
      }),
    });
  }).pipe(
    // Stop right after the connect request: only its input is under test.
    Effect.provideService(OpenCodeRuntime.OpenCodeRuntime, {
      connectToOpenCodeServer: (input: ConnectInput) => {
        connects.push(input);
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
    Effect.provide(Layer.merge(IdAllocator.layer, McpProviderSessions.layer)),
    Effect.scoped,
  );
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(capture);
    assert.isTrue(Exit.isFailure(exit));
    return connects;
  });
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
