/**
 * Pure model of the provider-retry composer banner (`t3team-ProviderRetryBanner.tsx`): what it
 * says, when its countdown next changes, and the recovery update its toggle writes.
 */
import type { OrchestrationV2TransientRecoveryUpdate } from "@t3tools/contracts";
import type {
  ActiveProviderRetry,
  TransientFailureRecovery,
} from "@t3tools/client-runtime/state/provider-retry";

export type ProviderRetryBannerModel =
  | {
      readonly kind: "retrying";
      readonly id: string;
      readonly title: string;
      readonly description: string;
      readonly nextTryAtMs: number | null;
    }
  | {
      readonly kind: "failed";
      readonly id: string;
      readonly title: string;
      readonly description: string;
      readonly nextTryAtMs: number | null;
      readonly failure: TransientFailureRecovery;
      /** Auto-resume holds; a run the host never armed (a delegated child, a workflow step) has no toggle. */
      readonly autoResume: boolean;
      readonly canToggle: boolean;
    };

const parseMs = (iso: string | null | undefined): number | null => {
  const ms = iso == null ? Number.NaN : Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

/** A live in-turn retry wins: the run is still going. Otherwise the failed run's recovery. */
export function providerRetryBannerModel(input: {
  readonly active: ActiveProviderRetry | null;
  readonly failed: TransientFailureRecovery | null;
}): ProviderRetryBannerModel | null {
  const { active, failed } = input;
  if (active !== null) {
    const progress =
      active.maxAttempts === null ? `${active.attempt}` : `${active.attempt}/${active.maxAttempts}`;
    const updatedAtMs = parseMs(active.updatedAt);
    return {
      kind: "retrying",
      id: `provider-retry:${active.itemId}`,
      title: `Retrying ${active.providerLabel} · attempt ${progress}`,
      description: active.cause,
      nextTryAtMs:
        updatedAtMs === null || active.retryDelayMs === null
          ? null
          : updatedAtMs + active.retryDelayMs,
    };
  }
  if (failed === null) return null;
  const recovery = failed.recovery;
  const autoResume = recovery?.autoResume ?? true;
  return {
    kind: "failed",
    id: `transient-recovery:${failed.runId}`,
    title: "Gateway keeps failing",
    description: failed.cause,
    nextTryAtMs: autoResume ? parseMs(recovery?.nextTryAt) : null,
    failure: failed,
    autoResume,
    canToggle: recovery !== null,
  };
}

/** "next try in 12s" / "next try in 4m"; seconds below two minutes, whole minutes above. */
export function countdownText(nextTryAtMs: number, nowMs: number): string {
  const remainingMs = nextTryAtMs - nowMs;
  if (remainingMs <= 0) return "retrying now";
  const seconds = Math.ceil(remainingMs / 1000);
  return seconds < 120 ? `next try in ${seconds}s` : `next try in ${Math.ceil(seconds / 60)}m`;
}

/** Delay until `countdownText` changes, or null once it settled on "retrying now". */
export function nextCountdownTickMs(nextTryAtMs: number, nowMs: number): number | null {
  const remainingMs = nextTryAtMs - nowMs;
  if (remainingMs <= 0) return null;
  const step = remainingMs > 120_000 ? 60_000 : 1_000;
  return remainingMs % step || step;
}

/** The status after the countdown when there is none to show. */
export function failedStatusText(model: Extract<ProviderRetryBannerModel, { kind: "failed" }>) {
  if (!model.autoResume) return "auto-resume off";
  return model.canToggle ? "resuming" : null;
}

/** Turning auto-resume on resumes at the armed time, or now when that has passed. */
export function transientRecoveryToggle(
  model: Extract<ProviderRetryBannerModel, { kind: "failed" }>,
  nowMs: number,
): OrchestrationV2TransientRecoveryUpdate {
  const runId = model.failure.runId;
  if (model.autoResume) return { runId, autoResume: false };
  const armedMs = parseMs(model.failure.recovery?.nextTryAt);
  return {
    runId,
    autoResume: true,
    nextTryAt: new Date(armedMs !== null && armedMs > nowMs ? armedMs : nowMs).toISOString(),
  };
}
