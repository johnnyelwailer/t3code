/**
 * Provider usage-limit sampling — Codex.
 *
 * Reads the latest rate-limit snapshot from the running Codex session.
 * The CodexAdapter (which wraps the live Codex app-server connection)
 * receives `account/rateLimits/updated` notifications from the session
 * and stores the payload in this module. The sampler simply reads the
 * stored snapshot and maps it using the existing `mapCodexRateLimits`
 * function.
 *
 * No process spawning, no JSON-RPC, no PATH management, no header
 * parsing. The data flows from the already-running Codex session.
 *
 * @module t3team-codexUsageSampler
 */
import { ProviderInstanceId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { mapCodexRateLimits, type CodexRateLimitsBody } from "./t3team-providerUsageMappers.ts";
import {
  PROVIDER_USAGE_CODEX_DRIVER,
  ProviderUsageSamplerError,
  type ProviderUsageThresholds,
} from "./t3team-providerUsageSampler.ts";

/**
 * Freshness budget for the stored snapshot. Codex emits
 * `account/rateLimits/updated` on every turn, so a live session refreshes
 * the store far more often than this. A snapshot older than the budget is
 * left over from a stopped session and must not drive hold decisions
 * (seen live: a 7-day-old exhausted snapshot opened holds while the real
 * window had ~40% left).
 */
export const CODEX_RATE_LIMITS_FRESHNESS_MS = 10 * 60_000;

/**
 * The in-memory store for the latest Codex rate-limit snapshot, populated
 * by the CodexAdapter when it receives an `account/rateLimits/updated`
 * notification from the running session. `receivedAtMs` stamps the
 * notification so the sampler can reject stale data.
 */
let latestCodexRateLimits:
  | {
      readonly body: CodexRateLimitsBody;
      readonly receivedAtMs: number;
    }
  | undefined;

/**
 * Called by the CodexAdapter when it receives a rate-limit notification
 * from the running Codex session. Stores the snapshot for later sampling.
 * `receivedAtMs` defaults to the wall clock; tests inject it.
 */
export const setLatestCodexRateLimits = (
  body: CodexRateLimitsBody,
  receivedAtMs: number = DateTime.nowUnsafe().epochMilliseconds,
): void => {
  latestCodexRateLimits = { body, receivedAtMs };
};

/** Test hook. */
export const resetCodexRateLimitsStore = (): void => {
  latestCodexRateLimits = undefined;
};

/**
 * Samples the Codex plan limits from the stored session snapshot.
 *
 * Returns a failure when no rate-limit notification has been received yet
 * (session not started or no update since boot) or when the stored one is
 * older than `CODEX_RATE_LIMITS_FRESHNESS_MS`. The watcher treats a
 * sampling failure as "no data this tick" and retries on the next sweep.
 */
export const sampleCodexUsage = Effect.fn("providerUsageSampler.sampleCodexUsage")(
  function* (input: {
    readonly providerInstanceId?: ProviderInstanceId;
    readonly thresholds?: ProviderUsageThresholds;
  }) {
    const codexError = (message: string) =>
      new ProviderUsageSamplerError({
        provider: PROVIDER_USAGE_CODEX_DRIVER,
        ...(input.providerInstanceId !== undefined
          ? { providerInstanceId: input.providerInstanceId }
          : {}),
        reason: message,
      });

    const nowMs = yield* Clock.currentTimeMillis;
    if (
      latestCodexRateLimits === undefined ||
      nowMs - latestCodexRateLimits.receivedAtMs >= CODEX_RATE_LIMITS_FRESHNESS_MS
    ) {
      // Stale counts as absent: the watcher treats this as "no data this tick".
      return yield* Effect.fail(
        codexError("No rate-limit notification received from the Codex session yet."),
      );
    }

    const sampledAt = DateTime.formatIso(DateTime.fromEpochSeconds(Math.floor(nowMs / 1000)));

    return mapCodexRateLimits(latestCodexRateLimits.body, {
      provider: PROVIDER_USAGE_CODEX_DRIVER,
      ...(input.providerInstanceId !== undefined
        ? { providerInstanceId: input.providerInstanceId }
        : {}),
      ...(input.thresholds !== undefined ? { thresholds: input.thresholds } : {}),
      sampledAt,
    });
  },
);
