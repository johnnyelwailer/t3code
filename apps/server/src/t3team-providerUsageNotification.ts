// @effect-diagnostics globalDate:off globalDateInEffect:off -- compare provider wall-clock stamps.
/** Best-effort usage context for existing child-boundary notifications. */
import {
  ProviderInstanceId,
  providerUsageSeverity,
  sessionUsageWindow,
  type ServerProvider,
  type ServerProviderUsageWindow,
} from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import type { ProviderRegistryShape } from "./provider/Services/ProviderRegistry.ts";
import { loadInFlightOnProvider } from "./t3team-providerUsageNotificationChildren.ts";

export const PROVIDER_USAGE_NOTIFICATION_REFRESH_MS = 1_500;
export const PROVIDER_USAGE_NOTIFICATION_MAX_AGE_MS = 90_000;

export interface ProviderUsageNotificationSample {
  readonly checkedAt: string;
  readonly window: ServerProviderUsageWindow;
}

export type ProviderUsageNotificationInput = {
  readonly provider: string | null | undefined;
  readonly parentThreadId: string;
  readonly projectId: string;
};
export type ProviderUsageNotificationReader = (
  input: ProviderUsageNotificationInput,
) => Effect.Effect<string>;

/** Pure formatter. A missing, old, or incomplete sample adds no partial line. */
export function providerUsageNotificationLine(input: {
  readonly provider: string | null | undefined;
  readonly parentThreadId: string;
  readonly providerUsageSample?: ProviderUsageNotificationSample | null;
  readonly inFlightOnProvider?: number;
  readonly nowMs?: number;
}): string {
  const { provider, providerUsageSample: sample, inFlightOnProvider } = input;
  if (!provider || !sample || inFlightOnProvider === undefined) return "";
  const { window } = sample;
  if (!window.resetsAt || !window.windowDurationMins || window.windowDurationMins <= 0) return "";
  const nowMs = input.nowMs ?? Date.now();
  const checkedMs = Date.parse(sample.checkedAt);
  const resetMs = Date.parse(window.resetsAt);
  if (
    !Number.isFinite(checkedMs) ||
    checkedMs > nowMs ||
    nowMs - checkedMs > PROVIDER_USAGE_NOTIFICATION_MAX_AGE_MS ||
    !Number.isFinite(resetMs) ||
    resetMs <= nowMs ||
    !Number.isFinite(window.usedPercent) ||
    !Number.isInteger(inFlightOnProvider) ||
    inFlightOnProvider < 0
  )
    return "";
  const duration =
    window.windowDurationMins % 60 === 0
      ? `${window.windowDurationMins / 60}h`
      : `${window.windowDurationMins}m`;
  const resets = window.resetsAt.replace(/\.\d{3}Z$/, "Z");
  return (
    `\n[provider-usage] ${provider}: ${Math.round(window.usedPercent)}% of ${duration} window ` +
    `(resets ${resets}, ${providerUsageSeverity(window.usedPercent)}) · ` +
    `${inFlightOnProvider} in-flight children on this provider`
  );
}

const freshSample = (providers: ReadonlyArray<ServerProvider>, instanceId: string) => {
  const provider = providers.find((item) => item.instanceId === instanceId);
  const limits = provider?.usageLimits;
  const window = sessionUsageWindow(limits);
  return provider && limits && window && limits.unavailable === undefined
    ? { provider: String(provider.instanceId), sample: { checkedAt: limits.checkedAt, window } }
    : undefined;
};

type ObservedUsage = NonNullable<ReturnType<typeof freshSample>>;

/** A timed-out or failed refresh can use only a still-live cached snapshot. */
export const selectProviderUsageObservation = (input: {
  readonly fresh?: ObservedUsage;
  readonly cached?: ObservedUsage;
  readonly nowMs: number;
}): ObservedUsage | undefined => {
  for (const observed of [input.fresh, input.cached]) {
    if (!observed) continue;
    const age = input.nowMs - Date.parse(observed.sample.checkedAt);
    if (Number.isFinite(age) && age >= 0 && age <= PROVIDER_USAGE_NOTIFICATION_MAX_AGE_MS) {
      return observed;
    }
  }
  return undefined;
};

/** Reads upstream's one provider-usage pipeline; refresh is bounded, cache is age-gated. */
export const makeProviderUsageNotificationLine =
  (deps: {
    readonly query: ProjectionSnapshotQueryShape;
    readonly registry: ProviderRegistryShape;
  }) =>
  (input: ProviderUsageNotificationInput): Effect.Effect<string> =>
    Effect.gen(function* () {
      const instanceId = input.provider;
      if (!instanceId) return "";
      const cached = freshSample(yield* deps.registry.getProviders, instanceId);
      const refreshed = yield* deps.registry
        .refreshInstance(ProviderInstanceId.make(instanceId))
        .pipe(
          Effect.timeoutOption(Duration.millis(PROVIDER_USAGE_NOTIFICATION_REFRESH_MS)),
          Effect.catchCause(() => Effect.succeed(Option.none())),
        );
      const refreshedProviders = Option.getOrUndefined(refreshed);
      if (
        refreshedProviders?.find((item) => item.instanceId === instanceId)?.usageLimits?.unavailable
          ?.reason === "unsupported"
      )
        return "";
      const fresh = refreshedProviders ? freshSample(refreshedProviders, instanceId) : undefined;
      const observed = selectProviderUsageObservation({
        ...(fresh ? { fresh } : {}),
        ...(cached ? { cached } : {}),
        nowMs: Date.now(),
      });
      if (!observed) return "";
      const count = yield* loadInFlightOnProvider(deps.query, {
        parentThreadId: input.parentThreadId,
        projectId: input.projectId,
        provider: instanceId,
      });
      return providerUsageNotificationLine({
        provider: observed.provider,
        parentThreadId: input.parentThreadId,
        providerUsageSample: observed.sample,
        inFlightOnProvider: count,
      });
    }).pipe(Effect.catchCause(() => Effect.succeed("")));
