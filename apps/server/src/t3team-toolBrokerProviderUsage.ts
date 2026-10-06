/**
 * Broker handler for `t3team.runtime.provider_usage`.
 *
 * Reads upstream's provider-usage pipeline — the usage windows each provider
 * instance publishes on `ServerProvider.usageLimits`, plus the accounts the
 * configured CLIProxyAPI hubs report — and returns them per INSTANCE with a
 * severity per window. It samples nothing itself: the probe cadence and the
 * live rate-limit merges belong to the provider snapshots.
 *
 * @module t3team-toolBrokerProviderUsage
 */
import {
  PROVIDER_USAGE_CONTRACT_VERSION,
  hasUsageData,
  providerUsageSeverity,
  sessionUsageWindow,
  type ProviderUsageQueryResult,
  type ServerProvider,
  type ServerProviderUsageLimits,
  type UsageLimitSourceSnapshot,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";

const ProviderUsageToolArgs = Schema.Struct({
  provider_instance_id: Schema.optional(Schema.String),
});
// Tool arguments arrive untyped from the model.
const decodeToolArgs = Schema.decodeUnknownExit(ProviderUsageToolArgs);

const windowViews = (limits: ServerProviderUsageLimits | undefined) =>
  hasUsageData(limits)
    ? limits.windows.map((window) => ({
        ...window,
        severity: providerUsageSeverity(window.usedPercent),
      }))
    : [];

const sessionSeverity = (limits: ServerProviderUsageLimits | undefined) => {
  const session = sessionUsageWindow(limits);
  return session === null ? null : providerUsageSeverity(session.usedPercent);
};

const unavailableReason = (limits: ServerProviderUsageLimits | undefined): string | undefined => {
  if (limits === undefined) return "no usage reported for this instance";
  if (limits.unavailable !== undefined) {
    return limits.unavailable.message ?? limits.unavailable.reason;
  }
  return limits.windows.length === 0 ? "no usage windows reported" : undefined;
};

/** Pure projection of the published snapshots into the tool answer. */
const buildProviderUsageResult = (input: {
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly sources: ReadonlyArray<UsageLimitSourceSnapshot>;
  readonly providerInstanceId?: string;
}): ProviderUsageQueryResult => {
  const selected = input.providers.filter(
    (provider) =>
      provider.enabled &&
      (input.providerInstanceId === undefined || provider.instanceId === input.providerInstanceId),
  );
  // Hub accounts are not runnable instances; they only answer the unfiltered question.
  const sources = input.providerInstanceId === undefined ? input.sources : [];
  return {
    contractVersion: PROVIDER_USAGE_CONTRACT_VERSION,
    instances: selected.map((provider) => {
      const unavailable = unavailableReason(provider.usageLimits);
      return {
        providerInstanceId: provider.instanceId,
        driver: provider.driver,
        ...(provider.displayName?.trim() ? { displayName: provider.displayName.trim() } : {}),
        ...(provider.usageLimits ? { checkedAt: provider.usageLimits.checkedAt } : {}),
        sessionSeverity: sessionSeverity(provider.usageLimits),
        windows: windowViews(provider.usageLimits),
        ...(unavailable !== undefined ? { unavailable } : {}),
      };
    }),
    hubAccounts: sources.flatMap((source) =>
      source.accounts.map((account) => ({
        sourceId: source.id,
        sourceLabel: source.label,
        accountId: account.id,
        driver: account.driver,
        ...(account.plan ? { plan: account.plan } : {}),
        checkedAt: account.usageLimits.checkedAt,
        sessionSeverity: sessionSeverity(account.usageLimits),
        windows: windowViews(account.usageLimits),
      })),
    ),
    hubErrors: sources.flatMap((source) =>
      source.error === undefined ? [] : [{ sourceId: source.id, error: source.error }],
    ),
  };
};

export const makeReadProviderUsage =
  (input: {
    readonly providerRegistry:
      | { readonly getProviders: Effect.Effect<ReadonlyArray<ServerProvider>> }
      | undefined;
    readonly usageLimitSources:
      | { readonly current: Effect.Effect<ReadonlyArray<UsageLimitSourceSnapshot>> }
      | undefined;
  }): ((toolArgs: unknown) => Effect.Effect<T3TeamToolCallResult>) =>
  (toolArgs) =>
    Effect.gen(function* () {
      if (input.providerRegistry === undefined) {
        return errorResult(
          "Provider usage is not available in this runtime (no provider registry).",
        );
      }
      const argsExit = decodeToolArgs(toolArgs ?? {});
      if (Exit.isFailure(argsExit)) {
        return errorResult(`Invalid arguments for provider usage: ${String(argsExit.cause)}`);
      }
      const providers = yield* input.providerRegistry.getProviders;
      const sources = input.usageLimitSources ? yield* input.usageLimitSources.current : [];
      const instanceId = argsExit.value.provider_instance_id;
      if (instanceId !== undefined && !providers.some((p) => p.instanceId === instanceId)) {
        return errorResult(
          `Unknown provider instance '${instanceId}'. Check orchestrator_capabilities for the configured instances.`,
        );
      }
      return okResult({
        providerUsage: buildProviderUsageResult({
          providers,
          sources,
          ...(instanceId !== undefined ? { providerInstanceId: instanceId } : {}),
        }),
      });
    });
