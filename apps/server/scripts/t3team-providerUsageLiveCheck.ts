#!/usr/bin/env node
/**
 * Live provider usage-limit check.
 *
 * Samples the real plan-limit windows for the providers installed on this
 * machine (Claude via the Anthropic OAuth usage endpoint, Codex via a
 * transient `codex app-server`) and prints the contract result as JSON:
 *
 *   node apps/server/scripts/t3team-providerUsageLiveCheck.ts
 *
 * Read-only against the provider accounts; used as the acceptance receipt
 * for `t3team.runtime.provider_usage` (see docs/t3team-mvp/21-context-tool-catalog.md).
 */
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import { FetchHttpClient } from "effect/unstable/http";

import { ProviderDriverKind, ProviderInstanceId, type ServerSettings } from "@t3tools/contracts";

import { sampleProviderInstancesUsage } from "../src/provider/t3team-providerUsageSampler.ts";

// Synthetic settings shaped like the server's default built-in instances: one
// enabled instance per known driver, default driver configs.
const settings = {
  providerInstances: {
    [ProviderInstanceId.make("claudeAgent")]: {
      driver: ProviderDriverKind.make("claudeAgent"),
      config: {},
    },
    [ProviderInstanceId.make("codex")]: {
      driver: ProviderDriverKind.make("codex"),
      config: {},
    },
  },
} as unknown as ServerSettings;

const program = Effect.gen(function* () {
  const scope = yield* Scope.make();
  const result = yield* Scope.provide(scope)(sampleProviderInstancesUsage(settings, {}));
  yield* Scope.close(scope, Exit.void);
  // @effect-diagnostics-next-line preferSchemaOverJson:off - dev receipt prints the contract JSON.
  return yield* Console.log(JSON.stringify(result, null, 2));
});

program.pipe(
  Effect.provide(Layer.merge(NodeServices.layer, FetchHttpClient.layer)),
  NodeRuntime.runMain,
);
