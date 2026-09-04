/**
 * Provider usage-limit sampling — orchestrator.
 *
 * Asks the provider for its LIVE rolling plan limits (not the transcript
 * consumption scans in `usage.ts`). The per-provider wire samplers live in
 * `t3team-claudeUsageSampler.ts` and `t3team-codexUsageSampler.ts`; the pure
 * wire→contract mappers in `t3team-providerUsageMappers.ts`.
 *
 * Driver kinds with a live-limit source: `ProviderDriverKind` is open
 * vocabulary, so a fork registering a new driver adds a sampler module here
 * and one `sampleOneInstance` branch — nothing else changes.
 *
 * @module t3team-providerUsageSampler
 */
import {
  PROVIDER_USAGE_CONTRACT_VERSION,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderUsageQueryResult,
  ProviderUsageReport,
  ProviderUsageUnavailable,
  type ServerSettings,
  ClaudeSettings,
  CodexSettings,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { sampleClaudeUsage } from "./t3team-claudeUsageSampler.ts";
import { sampleCodexUsage } from "./t3team-codexUsageSampler.ts";

/** Driver kinds with a live-limit source. */
export const PROVIDER_USAGE_CLAUDE_DRIVER = ProviderDriverKind.make("claudeAgent");
export const PROVIDER_USAGE_CODEX_DRIVER = ProviderDriverKind.make("codex");

/** Per-sample network budget; one call samples providers in parallel. */
export const PROVIDER_USAGE_SAMPLE_TIMEOUT_MS = 20_000;

/**
 * Thresholds for the host-derived severity verdict. Defaults: 80% = warning,
 * 100% = critical (window exhausted).
 */
export interface ProviderUsageThresholds {
  readonly warningPercent: number;
  readonly criticalPercent: number;
}

export const DEFAULT_PROVIDER_USAGE_THRESHOLDS: ProviderUsageThresholds = {
  warningPercent: 80,
  criticalPercent: 100,
};

export const ProviderUsageThresholdsSchema = Schema.Struct({
  warningPercent: Schema.Number,
  criticalPercent: Schema.Number,
});

export class ProviderUsageSamplerError extends Schema.TaggedErrorClass<ProviderUsageSamplerError>()(
  "ProviderUsageSamplerError",
  {
    provider: ProviderDriverKind,
    providerInstanceId: Schema.optional(ProviderInstanceId),
    reason: Schema.String,
  },
) {}

export const isProviderUsageSamplerError = Schema.is(ProviderUsageSamplerError);

/**
 * Maps a percentage against the thresholds. `critical` wins so a fully
 * exhausted window is never under-reported.
 */
export const severityForPercent = (
  percent: number,
  thresholds: ProviderUsageThresholds = DEFAULT_PROVIDER_USAGE_THRESHOLDS,
): "normal" | "warning" | "critical" =>
  percent >= thresholds.criticalPercent
    ? "critical"
    : percent >= thresholds.warningPercent
      ? "warning"
      : "normal";

/**
 * The argument shape for one `t3team.runtime.provider_usage` call. The MCP
 * surface uses snake_case (`provider_instance_id`), matching the other t3team
 * tools; the broker dispatch forwards that shape verbatim.
 */
export const ProviderUsageToolArgs = Schema.Struct({
  provider_instance_id: Schema.optional(Schema.String),
});
export type ProviderUsageToolArgs = typeof ProviderUsageToolArgs.Type;

const isKnownUsageDriver = (driver: ProviderDriverKind): boolean =>
  driver === PROVIDER_USAGE_CLAUDE_DRIVER || driver === PROVIDER_USAGE_CODEX_DRIVER;

const toUnavailable = (
  driver: ProviderDriverKind,
  instanceId: string,
  cause: unknown,
): ProviderUsageUnavailable => ({
  provider: driver,
  providerInstanceId: ProviderInstanceId.make(instanceId),
  reason: isProviderUsageSamplerError(cause)
    ? cause.reason
    : cause instanceof Error
      ? cause.message
      : String(cause),
});

const sampleOneInstance = (
  settings: ServerSettings,
  instanceId: string,
  driver: ProviderDriverKind,
  thresholds: ProviderUsageThresholds | undefined,
) => {
  const instanceConfig = settings.providerInstances[ProviderInstanceId.make(instanceId)];
  const rawConfig = instanceConfig?.config ?? {};
  const instanceRef = ProviderInstanceId.make(instanceId);
  if (driver === PROVIDER_USAGE_CLAUDE_DRIVER) {
    const claudeSettings = Schema.decodeUnknownEffect(ClaudeSettings)(rawConfig).pipe(
      Effect.orElseSucceed(() => Schema.decodeSync(ClaudeSettings)({})),
    );
    return claudeSettings.pipe(
      Effect.flatMap((decoded) =>
        sampleClaudeUsage({
          ...(decoded.homePath !== undefined ? { homePath: decoded.homePath } : {}),
          providerInstanceId: instanceRef,
          ...(thresholds !== undefined ? { thresholds } : {}),
        }),
      ),
    );
  }
  const codexSettings = Schema.decodeUnknownEffect(CodexSettings)(rawConfig).pipe(
    Effect.orElseSucceed(() => Schema.decodeSync(CodexSettings)({})),
  );
  return codexSettings.pipe(
    Effect.flatMap((decoded) =>
      sampleCodexUsage({
        binaryPath: decoded.binaryPath,
        ...(decoded.homePath !== undefined ? { homePath: decoded.homePath } : {}),
        providerInstanceId: instanceRef,
        ...(thresholds !== undefined ? { thresholds } : {}),
      }),
    ),
  );
};

/**
 * Samples every requested (or every enabled) instance whose driver has a
 * live-limit source, degrading per-instance failures into `unavailable`
 * entries instead of failing the whole call.
 */
export const sampleProviderInstancesUsage = Effect.fn(
  "providerUsageSampler.sampleProviderInstancesUsage",
)(function* (
  settings: ServerSettings,
  input: {
    readonly requestedInstanceIds?: ReadonlySet<string>;
    readonly thresholds?: ProviderUsageThresholds;
  } = {},
) {
  const requested = input.requestedInstanceIds;
  const candidates: Array<{ readonly instanceId: string; readonly driver: ProviderDriverKind }> =
    [];
  for (const [instanceId, instance] of Object.entries(settings.providerInstances)) {
    if (instance.enabled === false) continue;
    if (!isKnownUsageDriver(instance.driver)) continue;
    if (requested !== undefined && !requested.has(instanceId)) continue;
    candidates.push({ instanceId, driver: instance.driver });
  }

  const results = yield* Effect.all(
    candidates.map((candidate) =>
      sampleOneInstance(settings, candidate.instanceId, candidate.driver, input.thresholds).pipe(
        Effect.exit,
      ),
    ),
    { concurrency: "unbounded" },
  );

  const reports: ProviderUsageReport[] = [];
  const unavailable: ProviderUsageUnavailable[] = [];
  for (const [index, exit] of results.entries()) {
    const candidate = candidates[index]!;
    if (Exit.isSuccess(exit)) {
      reports.push(exit.value);
    } else {
      unavailable.push(toUnavailable(candidate.driver, candidate.instanceId, exit.cause));
    }
  }
  return {
    contractVersion: PROVIDER_USAGE_CONTRACT_VERSION,
    reports,
    unavailable,
  } satisfies ProviderUsageQueryResult;
});
