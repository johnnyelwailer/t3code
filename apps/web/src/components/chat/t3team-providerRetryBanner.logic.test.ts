import { RunId } from "@t3tools/contracts";
import type {
  ActiveProviderRetry,
  TransientFailureRecovery,
} from "@t3tools/client-runtime/state/provider-retry";
import { describe, expect, it } from "vite-plus/test";

import {
  countdownText,
  failedStatusText,
  nextCountdownTickMs,
  providerRetryBannerModel,
  transientRecoveryToggle,
} from "./t3team-providerRetryBanner.logic";

const T0 = Date.parse("2026-10-11T10:00:00.000Z");

const active: ActiveProviderRetry = {
  itemId: "error-1",
  attempt: 2,
  maxAttempts: 5,
  retryDelayMs: 8_000,
  updatedAt: new Date(T0).toISOString(),
  cause: "The request queue is full.",
  providerLabel: "Nexplore",
};

const failed = (recovery: TransientFailureRecovery["recovery"]): TransientFailureRecovery => ({
  runId: RunId.make("run-1"),
  cause: "Gateway timeout (504)",
  providerLabel: "Nexplore",
  recovery,
});

function failedModel(recovery: TransientFailureRecovery["recovery"]) {
  const model = providerRetryBannerModel({ active: null, failed: failed(recovery) });
  if (model?.kind !== "failed") throw new Error("expected the failed banner");
  return model;
}

describe("providerRetryBannerModel", () => {
  it("shows the live retry with its attempt and next try, and wins over a failed run", () => {
    const model = providerRetryBannerModel({ active, failed: failed(null) });
    expect(model).toMatchObject({
      kind: "retrying",
      title: "Retrying Nexplore · attempt 2/5",
      description: "The request queue is full.",
      nextTryAtMs: T0 + 8_000,
    });
  });

  it("is absent once nothing retries and nothing failed transiently", () => {
    expect(providerRetryBannerModel({ active: null, failed: null })).toBeNull();
  });

  it("keeps the failed state with the armed next try while auto-resume holds", () => {
    const model = failedModel({
      runId: RunId.make("run-1"),
      nextTryAt: new Date(T0 + 300_000).toISOString(),
      autoResume: true,
    });
    expect(model).toMatchObject({
      title: "Gateway keeps failing",
      nextTryAtMs: T0 + 300_000,
      autoResume: true,
      canToggle: true,
    });
  });

  it("has no toggle before the host armed (or for runs it never retries)", () => {
    const model = failedModel(null);
    expect(model.canToggle).toBe(false);
    expect(failedStatusText(model)).toBeNull();
  });

  it("drops the countdown when auto-resume is off", () => {
    const model = failedModel({
      runId: RunId.make("run-1"),
      nextTryAt: new Date(T0 + 300_000).toISOString(),
      autoResume: false,
    });
    expect(model.nextTryAtMs).toBeNull();
    expect(failedStatusText(model)).toBe("auto-resume off");
  });
});

describe("countdown", () => {
  it("counts seconds below two minutes and whole minutes above", () => {
    expect(countdownText(T0 + 8_000, T0)).toBe("next try in 8s");
    expect(countdownText(T0 + 7_200, T0)).toBe("next try in 8s");
    expect(countdownText(T0 + 300_000, T0)).toBe("next try in 5m");
    expect(countdownText(T0, T0 + 1)).toBe("retrying now");
  });

  it("re-renders only when the text changes, and stops once due", () => {
    expect(nextCountdownTickMs(T0 + 7_200, T0)).toBe(200);
    expect(nextCountdownTickMs(T0 + 8_000, T0)).toBe(1_000);
    expect(nextCountdownTickMs(T0 + 300_000, T0)).toBe(60_000);
    expect(nextCountdownTickMs(T0 + 150_500, T0)).toBe(30_500);
    expect(nextCountdownTickMs(T0, T0)).toBeNull();
  });
});

describe("transientRecoveryToggle", () => {
  it("turns auto-resume off for the failed run", () => {
    const model = failedModel({ runId: RunId.make("run-1"), nextTryAt: null, autoResume: true });
    expect(transientRecoveryToggle(model, T0)).toEqual({ runId: "run-1", autoResume: false });
  });

  it("turning it back on keeps a future armed time and resumes now once it passed", () => {
    const future = new Date(T0 + 60_000).toISOString();
    const pending = failedModel({
      runId: RunId.make("run-1"),
      nextTryAt: future,
      autoResume: false,
    });
    expect(transientRecoveryToggle(pending, T0)).toEqual({
      runId: "run-1",
      autoResume: true,
      nextTryAt: future,
    });
    const lapsed = failedModel({ runId: RunId.make("run-1"), nextTryAt: null, autoResume: false });
    expect(transientRecoveryToggle(lapsed, T0)).toEqual({
      runId: "run-1",
      autoResume: true,
      nextTryAt: new Date(T0).toISOString(),
    });
  });
});
