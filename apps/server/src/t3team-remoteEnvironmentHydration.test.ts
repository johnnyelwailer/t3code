/**
 * The production wiring of the `remoteEnvironment` driver: the REAL provider registry hydration
 * (`ProviderInstanceRegistryHydration.layer`) with the flag on, the real shared cloud-session
 * access over a fake enabled broker. A placed child's turn must reach the broker's `attach`; with no
 * cloud-session access in the server's context, the turn must fail with that reason.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { CloudSessionFailedError, EnvironmentId, ProviderSessionId } from "@t3tools/contracts";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import type { ProviderAdapterV2Event } from "@t3tools/provider-core/server/ProviderAdapter";
import * as ProviderEventLoggers from "@t3tools/provider-core/server/ProviderEventLoggers";
import * as ProviderLatestVersions from "@t3tools/provider-core/server/ProviderLatestVersions";
import * as OpenCodeRuntime from "@t3tools/provider-opencode/server/OpenCodeRuntime";
import * as OpenCodeServerLedger from "@t3tools/provider-opencode/server/OpenCodeServerLedger";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse } from "effect/http";
import { afterEach, beforeEach } from "vite-plus/test";

import * as ServerSecretStore from "./auth/ServerSecretStore.ts";
import * as BackgroundPolicy from "./background/BackgroundPolicy.ts";
import { NexiBrokerService } from "./cloud/t3team-NexiBrokerService.ts";
import * as ServerConfig from "./config.ts";
import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import { RepositoryIdentityResolver } from "./project/RepositoryIdentityResolver.ts";
import * as AntigravityInstallation from "./provider/AntigravityInstallation.ts";
import * as CodexInstallation from "./provider/CodexInstallation.ts";
import * as ModelManifest from "./provider/ModelManifest.ts";
import * as ProviderInstanceRegistry from "./provider/ProviderInstanceRegistry.ts";
import * as ProviderInstanceRegistryHydration from "./provider/ProviderInstanceRegistryHydration.ts";
import * as ResetCreditCoordinator from "./provider/resetCreditCoordinator.ts";
import * as ServerSettingsModule from "./serverSettings.ts";
import {
  RemoteEnvironmentPlacements,
  remoteEnvironmentPlacementsMemoryLayer,
} from "./t3team-remoteEnvironmentPlacements.ts";
import { cloudSessionAccessLayer } from "./t3team-remoteEnvironmentServices.ts";
import { REPOSITORY, turn } from "./t3team-remoteEnvironmentSession.fixtures.ts";
import { REMOTE_ENVIRONMENT_INSTANCE_ID } from "./t3team-remoteEnvironmentTarget.ts";

beforeEach(() => replaceFeatureFlagPresetValues(new Map([["DELEGATE_CLOUD", true]])));
afterEach(() => replaceFeatureFlagPresetValues(new Map()));

const testHttpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({ version: "0.0.0" }))),
  ),
).pipe(Layer.provideMerge(ModelManifest.layerTest));

const backgroundPolicy = Layer.mock(BackgroundPolicy.BackgroundPolicy)({
  hasDemand: () => Effect.succeed(true),
  shouldRunScopeWork: () => Effect.succeed(true),
  shouldRunOpportunisticWork: Effect.succeed(true),
  streamChanges: Stream.empty,
});

const registryDependencies = Layer.mergeAll(
  AntigravityInstallation.AntigravityInstallation.layer,
  OpenCodeRuntime.layer.pipe(Layer.provide(OpenCodeServerLedger.layerTest)),
  remoteEnvironmentPlacementsMemoryLayer,
  Layer.mock(RepositoryIdentityResolver)({ resolve: () => Effect.succeed(null) }),
).pipe(
  Layer.provideMerge(ServerSettingsModule.layerTest()),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-remote-environment-" })),
  Layer.provideMerge(testHttpClient),
  Layer.provideMerge(
    Layer.succeed(
      ProviderEventLoggers.ProviderEventLoggers,
      ProviderEventLoggers.NoOpProviderEventLoggers,
    ),
  ),
  Layer.provideMerge(ProviderLatestVersions.layer),
  Layer.provideMerge(McpProviderSessions.layer),
  Layer.provideMerge(ResetCreditCoordinator.layerTest),
  Layer.provideMerge(backgroundPolicy),
  Layer.provideMerge(Layer.mock(ServerSecretStore.ServerSecretStore)({})),
  Layer.provideMerge(
    Layer.mock(CodexInstallation.CodexInstallation)({ managedDirectory: "unused" }),
  ),
  Layer.provideMerge(
    Layer.succeed(ServerEnvironment.ServerEnvironmentIdentity, {
      getEnvironmentId: Effect.succeed(EnvironmentId.make("00000000-0000-4000-8000-000000000001")),
    }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

const fakeBroker = (attached: Deferred.Deferred<string>) =>
  Layer.mock(NexiBrokerService)({
    enabled: true,
    status: { enabled: true, accountId: "fake-account" },
    attach: (input) =>
      Deferred.succeed(attached, input.sessionId).pipe(
        Effect.andThen(
          Effect.fail(
            new CloudSessionFailedError({
              reason: "session_ended",
              message: "That cloud session has ended.",
            }),
          ),
        ),
      ),
    pair: () =>
      Effect.fail(new CloudSessionFailedError({ reason: "broker_unavailable", message: "unused" })),
    sessions: Effect.succeed([{ runId: "run-41", environmentId: "env-41" }]),
  });

const runPlacedTurn = Effect.gen(function* () {
  const registry = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
  const placements = yield* RemoteEnvironmentPlacements;
  const instance = yield* registry.getInstance(REMOTE_ENVIRONMENT_INSTANCE_ID);
  assert.ok(instance);
  yield* placements.register(turn.threadId, { sessionId: "run-41", repositoryKey: REPOSITORY });
  const session = yield* instance.orchestrationAdapter.openSession({
    threadId: turn.threadId,
    providerSessionId: ProviderSessionId.make("session-1"),
    modelSelection: turn.modelSelection,
    runtimePolicy: turn.runtimePolicy,
  });
  yield* session.startTurn(turn);
  const events = yield* session.events.pipe(
    Stream.takeUntil((event: ProviderAdapterV2Event) => event.type === "turn.terminal"),
    Stream.runCollect,
  );
  return events.find((event) => event.type === "turn.terminal");
});

describe("remoteEnvironment on the real provider registry hydration", () => {
  it.live("a placed child's turn reaches the broker's attach through the shared access", () =>
    Effect.gen(function* () {
      const attached = yield* Deferred.make<string>();
      const terminal = yield* runPlacedTurn.pipe(
        Effect.provide(
          ProviderInstanceRegistryHydration.layer.pipe(
            Layer.provideMerge(cloudSessionAccessLayer),
            Layer.provideMerge(fakeBroker(attached)),
            Layer.provideMerge(registryDependencies),
          ),
        ),
      );
      assert.strictEqual(yield* Deferred.await(attached), "run-41");
      assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "failed");
      if (terminal?.type === "turn.terminal" && terminal.status === "failed") {
        assert.strictEqual(
          terminal.failure.message,
          "The cloud session ended before the child finished.",
        );
      }
    }).pipe(Effect.scoped),
  );

  it.live(
    "without cloud-session access in the server's context the turn fails with the reason",
    () =>
      Effect.gen(function* () {
        const terminal = yield* runPlacedTurn.pipe(
          Effect.provide(
            ProviderInstanceRegistryHydration.layer.pipe(Layer.provideMerge(registryDependencies)),
          ),
        );
        assert.isTrue(terminal?.type === "turn.terminal" && terminal.status === "failed");
        if (terminal?.type === "turn.terminal" && terminal.status === "failed") {
          assert.match(terminal.failure.message, /no Nexi broker connection for cloud sessions/);
        }
      }).pipe(Effect.scoped),
  );
});
