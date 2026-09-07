/**
 * Broker handler for `t3team.runtime.provider_usage`.
 *
 * Sibling of `t3team.runtime.models` (see t3team-toolBrokerLive.ts):
 * on-demand sampling of the live provider plan limits, no caching here —
 * the session-scoped watcher owns that (phase 2). Each requested provider
 * instance with a live-limit source is sampled; per-instance failures are
 * degraded to `unavailable` entries so one bad provider never hides the rest.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as Schema from "effect/Schema";
import { FetchHttpClient } from "effect/unstable/http";

import { type ServerSettings, type ServerSettingsError } from "@t3tools/contracts";
import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import {
  ProviderUsageToolArgs,
  sampleProviderInstancesUsage,
} from "./provider/t3team-providerUsageSampler.ts";

/**
 * Structural service view: the live binding passes the yielded
 * `ServerSettingsService` object; only `getSettings` matters here.
 */
export interface ProviderUsageSettingsView {
  readonly getSettings: Effect.Effect<ServerSettings, ServerSettingsError>;
}

/** Services the samplers need; provided here so the dispatch table can stay self-contained. */
const providerUsageLayer = Layer.merge(NodeServices.layer, FetchHttpClient.layer);

export const makeReadProviderUsage =
  (input: {
    readonly serverSettings: ProviderUsageSettingsView | undefined;
  }): ((toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>) =>
  (toolArgs) =>
    Effect.gen(function* () {
      if (input.serverSettings === undefined) {
        return errorResult(
          "Provider usage sampling is not available in this runtime (server settings not wired).",
        );
      }
      const settingsExit = yield* input.serverSettings.getSettings.pipe(Effect.exit);
      if (Exit.isFailure(settingsExit)) {
        return errorResult(`Failed to read server settings: ${String(settingsExit.cause)}`);
      }
      const settings = settingsExit.value;
      const argsExit = Schema.decodeUnknownExit(ProviderUsageToolArgs)(toolArgs ?? {});
      if (Exit.isFailure(argsExit)) {
        return errorResult(`Invalid arguments for provider usage: ${String(argsExit.cause)}`);
      }
      // Sampler side-effects (keychain child, transient app-server) run in a
      // private scope that is closed when the sampling settles.
      const sampling = sampleProviderInstancesUsage(settings, {
        ...(argsExit.value.provider_instance_id !== undefined
          ? { requestedInstanceIds: new Set([argsExit.value.provider_instance_id]) }
          : {}),
      });
      const result = yield* Effect.gen(function* () {
        const scope = yield* Scope.make();
        const out = yield* Scope.provide(scope)(sampling);
        yield* Scope.close(scope, Exit.void);
        return out;
      });
      return okResult({ providerUsage: result });
    }).pipe(Effect.provide(providerUsageLayer));
