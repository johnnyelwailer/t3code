/**
 * Provider usage-limit sampling — Claude.
 *
 * `GET https://api.anthropic.com/api/oauth/usage` with the OAuth bearer
 * token (see `t3team-claudeCredentials.ts`). Subscription plans report null
 * dollar fields, so percent + reset time are the truth.
 *
 * @module t3team-claudeUsageSampler
 */
import { ProviderInstanceId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

import { type ClaudeCredentials, readClaudeOauthCredentials } from "./t3team-claudeCredentials.ts";
import { mapClaudeUsage, type ClaudeUsageBody } from "./t3team-providerUsageMappers.ts";
import {
  PROVIDER_USAGE_CLAUDE_DRIVER,
  PROVIDER_USAGE_SAMPLE_TIMEOUT_MS,
  ProviderUsageSamplerError,
  isProviderUsageSamplerError,
  type ProviderUsageThresholds,
} from "./t3team-providerUsageSampler.ts";

export const CLAUDE_USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";

/**
 * Fetches and pre-validates the Anthropic OAuth usage body. Kept as a named
 * Effect so samplers can swap it in tests (the unit tests inject a mocked
 * response here rather than touching the wire).
 */
export const fetchClaudeUsageBody = Effect.fn("providerUsageSampler.fetchClaudeUsageBody")(
  function* (accessToken: string, providerInstanceId?: ProviderInstanceId) {
    const client = yield* HttpClient.HttpClient;
    const request = HttpClientRequest.get(CLAUDE_USAGE_ENDPOINT).pipe(
      HttpClientRequest.setHeader("authorization", `Bearer ${accessToken}`),
    );
    const response = yield* client.execute(request).pipe(
      Effect.timeout(PROVIDER_USAGE_SAMPLE_TIMEOUT_MS),
      Effect.mapError(
        (error) =>
          new ProviderUsageSamplerError({
            provider: PROVIDER_USAGE_CLAUDE_DRIVER,
            providerInstanceId,
            reason: `Anthropic usage request failed (${String(error)}).`,
          }),
      ),
    );
    if (response.status < 200 || response.status >= 300) {
      return yield* new ProviderUsageSamplerError({
        provider: PROVIDER_USAGE_CLAUDE_DRIVER,
        providerInstanceId,
        reason: `Anthropic usage endpoint returned HTTP ${String(response.status)}.`,
      });
    }
    return (yield* response.json) as ClaudeUsageBody;
  },
);

export type ClaudeUsageBodyFetcher = (
  accessToken: string,
  providerInstanceId?: ProviderInstanceId,
) => Effect.Effect<ClaudeUsageBody, ProviderUsageSamplerError>;

/**
 * Samples the Claude plan limits for one instance's account.
 *
 * `credentials` may be supplied by the caller (the session-scoped watcher
 * caches them); when omitted they are read fresh from the keychain / the
 * provider home's credentials file. `fetchUsageBody` defaults to the live
 * Anthropic endpoint and is swappable for tests.
 */
export const sampleClaudeUsage = Effect.fn("providerUsageSampler.sampleClaudeUsage")(function* (
  input: {
    readonly homePath?: string;
    readonly credentials?: ClaudeCredentials;
    readonly providerInstanceId?: ProviderInstanceId;
    readonly thresholds?: ProviderUsageThresholds;
    readonly fetchUsageBody?: ClaudeUsageBodyFetcher;
  } = {},
) {
  const fetchError = (error: unknown) =>
    new ProviderUsageSamplerError({
      provider: PROVIDER_USAGE_CLAUDE_DRIVER,
      ...(input.providerInstanceId !== undefined
        ? { providerInstanceId: input.providerInstanceId }
        : {}),
      reason: isProviderUsageSamplerError(error) ? error.reason : String(error),
    });
  const credentials =
    input.credentials ??
    (yield* readClaudeOauthCredentials(input.homePath).pipe(
      Effect.mapError((error) => fetchError(error)),
    ));
  const fetchBody = input.fetchUsageBody ?? fetchClaudeUsageBody;
  const body = yield* fetchBody(credentials.accessToken, input.providerInstanceId).pipe(
    Effect.mapError((error) => fetchError(error)),
  );
  const sampledAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const plan = credentials.subscriptionType ?? credentials.rateLimitTier;
  return mapClaudeUsage(body, {
    provider: PROVIDER_USAGE_CLAUDE_DRIVER,
    ...(input.providerInstanceId !== undefined
      ? { providerInstanceId: input.providerInstanceId }
      : {}),
    ...(plan !== undefined ? { plan } : {}),
    ...(input.thresholds !== undefined ? { thresholds: input.thresholds } : {}),
    sampledAt,
  });
});
