/**
 * The live over-alarm: "Timed out while checking Codex app-server provider status" rendered destructive,
 * `role="alert"`, over a Work Log card — while the turn was streaming fine on another instance.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vite-plus/test";

import {
  classifyT3TeamProviderStatusSeverity,
  shouldSuppressT3TeamProviderStatus,
} from "~/t3team/chat/t3team-providerStatusSeverity";

/** How the Codex probe timeout actually arrives (CodexProvider.ts): error + auth unknown. */
const PROBE_TIMEOUT = {
  status: "error",
  auth: { status: "unknown" },
  instanceId: "codex",
} as never;
const UNAUTHENTICATED = {
  status: "error",
  auth: { status: "unauthenticated" },
  instanceId: "codex",
} as never;
const REAL_ERROR = {
  status: "error",
  auth: { status: "authenticated" },
  instanceId: "codex",
} as never;
const LIMITED = {
  status: "warning",
  auth: { status: "authenticated" },
  instanceId: "codex",
} as never;

describe("classifyT3TeamProviderStatusSeverity", () => {
  it("treats a failed probe as informational, not as a provider failure", () => {
    expect(classifyT3TeamProviderStatusSeverity(PROBE_TIMEOUT)).toBe("info");
  });

  it("keeps a real auth failure destructive — it is actionable", () => {
    expect(classifyT3TeamProviderStatusSeverity(UNAUTHENTICATED)).toBe("error");
  });

  it("keeps a provider that answered badly destructive", () => {
    expect(classifyT3TeamProviderStatusSeverity(REAL_ERROR)).toBe("error");
  });

  it("leaves limited availability a warning", () => {
    expect(classifyT3TeamProviderStatusSeverity(LIMITED)).toBe("warning");
  });
});

describe("shouldSuppressT3TeamProviderStatus", () => {
  it("suppresses a failed probe while a turn streams on another instance", () => {
    expect(
      shouldSuppressT3TeamProviderStatus({
        status: PROBE_TIMEOUT,
        isTurnInProgress: true,
        activeTurnInstanceId: "claude",
      }),
    ).toBe(true);
  });

  it("never suppresses a real error, even mid-turn", () => {
    for (const status of [UNAUTHENTICATED, REAL_ERROR]) {
      expect(
        shouldSuppressT3TeamProviderStatus({
          status,
          isTurnInProgress: true,
          activeTurnInstanceId: "claude",
        }),
      ).toBe(false);
    }
  });

  it("shows a failed probe for the instance actually streaming", () => {
    expect(
      shouldSuppressT3TeamProviderStatus({
        status: PROBE_TIMEOUT,
        isTurnInProgress: true,
        activeTurnInstanceId: "codex",
      }),
    ).toBe(false);
  });

  it("shows a failed probe when nothing is in flight", () => {
    expect(
      shouldSuppressT3TeamProviderStatus({ status: PROBE_TIMEOUT, isTurnInProgress: false }),
    ).toBe(false);
    expect(shouldSuppressT3TeamProviderStatus({ status: null, isTurnInProgress: true })).toBe(
      false,
    );
  });
});

describe("a provider CLI missing on a cloud machine", () => {
  // Desktop showed "Claude Agent CLI (`claude`) was not found on PATH" for a cloud-session thread.
  const MISSING_ON_PATH = {
    status: "error",
    auth: { status: "unknown" },
    instanceId: "claudeAgent",
    installed: false,
  } as never;

  it("stays quiet on a cloud session or peer: the model picker offers the install", () => {
    expect(
      shouldSuppressT3TeamProviderStatus({
        status: MISSING_ON_PATH,
        isTurnInProgress: false,
        onRemoteEnvironment: true,
      }),
    ).toBe(true);
  });

  it("still shows on this desktop, and for an installed provider that fails remotely", () => {
    expect(
      shouldSuppressT3TeamProviderStatus({ status: MISSING_ON_PATH, isTurnInProgress: false }),
    ).toBe(false);
    expect(
      shouldSuppressT3TeamProviderStatus({
        status: REAL_ERROR,
        isTurnInProgress: false,
        onRemoteEnvironment: true,
      }),
    ).toBe(false);
  });
});

describe("provider readiness on a cloud session", () => {
  const remote = (status: unknown) =>
    shouldSuppressT3TeamProviderStatus({
      status: status as never,
      isTurnInProgress: false,
      onRemoteEnvironment: true,
    });

  it("raises no banner for states the install-then-sign-in flow resolves", () => {
    expect(remote(UNAUTHENTICATED)).toBe(true);
    expect(remote(PROBE_TIMEOUT)).toBe(true);
    expect(remote({ status: "disabled", auth: { status: "authenticated" }, instanceId: "x" })).toBe(
      true,
    );
  });

  it("still shows a provider that answered with a real error, and limited availability", () => {
    expect(remote(REAL_ERROR)).toBe(false);
    expect(remote(LIMITED)).toBe(false);
  });

  it("changes nothing on this desktop", () => {
    expect(
      shouldSuppressT3TeamProviderStatus({ status: UNAUTHENTICATED, isTurnInProgress: false }),
    ).toBe(false);
  });
});
