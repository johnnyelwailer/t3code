/**
 * t3team: a pack/declarative OpenCode config (`OpenCodeSettings.configContent`) reaches the
 * OpenCode server a V2 session connects to, so a spawned server runs with the pack's providers.
 */
import { assert, it } from "@effect/vitest";
import {
  OpenCodeSettings,
  ProviderInstanceId,
  ProviderSessionId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import type * as ServerConfig from "../../config.ts";
import { OpenCodeRuntimeError, type OpenCodeRuntimeShape } from "../../provider/opencodeRuntime.ts";
import * as IdAllocator from "../IdAllocator.ts";
import { ProviderAdapterV2RuntimePolicy } from "../ProviderAdapter.ts";
import { makeOpenCodeAdapterV2 } from "./OpenCodeAdapterV2.ts";

type ConnectInput = Parameters<OpenCodeRuntimeShape["connectToOpenCodeServer"]>[0];

const decodeSettings = Schema.decodeSync(OpenCodeSettings);

const openWith = (configContent: string) => {
  const settings = decodeSettings({ configContent });
  return Effect.gen(function* () {
    const idAllocator = yield* IdAllocator.IdAllocatorV2;
    const instanceId = ProviderInstanceId.make("opencode-config");
    const connects: Array<ConnectInput> = [];
    const adapter = makeOpenCodeAdapterV2({
      instanceId,
      settings,
      environment: {},
      runtime: {
        connectToOpenCodeServer: (input: ConnectInput) => {
          connects.push(input);
          // Stop right after the connect request: only its input is under test.
          return Effect.fail(
            new OpenCodeRuntimeError({ operation: "connect", detail: "test stops here" }),
          );
        },
      } as unknown as OpenCodeRuntimeShape,
      idAllocator,
      serverConfig: { cwd: "/workspace" } as ServerConfig.ServerConfig["Service"],
    });
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
  }).pipe(Effect.provide(IdAllocator.layer), Effect.scoped);
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
