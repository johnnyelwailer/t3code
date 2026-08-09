import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerProviderAuthStatus,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveProviderInstanceEntries } from "./providerInstances";
import {
  isProviderInstanceConnectable,
  resolveProviderInstanceReadiness,
} from "./t3team-providerInstanceReadiness";

function provider(input: {
  provider: ProviderDriverKind;
  instanceId: string;
  enabled?: boolean;
  availability?: ServerProvider["availability"];
  displayName?: string;
  status?: ServerProvider["status"];
  models?: ServerProvider["models"];
  /** Overridable so readiness tests can model a missing CLI / unauthenticated CLI. */
  installed?: boolean;
  authStatus?: ServerProviderAuthStatus;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: input.provider,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    enabled: input.enabled ?? true,
    installed: input.installed ?? true,
    version: null,
    status: input.status ?? "ready",
    ...(input.availability ? { availability: input.availability } : {}),
    auth: { status: input.authStatus ?? "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: input.models ?? [],
    slashCommands: [],
    skills: [],
  };
}

describe("resolveProviderInstanceReadiness", () => {
  it("is ready when the picker considers the instance ready", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({ provider: ProviderDriverKind.make("codex"), instanceId: "codex" }),
    ]);
    expect(entry && resolveProviderInstanceReadiness(entry)).toBe("ready");
  });

  it("needsInstall when the CLI isn't installed, even if auth also looks unresolved", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        provider: ProviderDriverKind.make("codex"),
        instanceId: "codex",
        status: "error",
        installed: false,
        authStatus: "unknown",
      }),
    ]);
    expect(entry && resolveProviderInstanceReadiness(entry)).toBe("needsInstall");
  });

  it("needsAuth for Codex's own unauthenticated signal", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        provider: ProviderDriverKind.make("codex"),
        instanceId: "codex",
        status: "error",
        authStatus: "unauthenticated",
      }),
    ]);
    expect(entry && resolveProviderInstanceReadiness(entry)).toBe("needsAuth");
  });

  it("needsAuth for Claude's 'unknown' default — the critical subtlety: Claude's health probe " +
    "never reports 'unauthenticated', only 'unknown', in every not-ready path", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        provider: ProviderDriverKind.make("claudeAgent"),
        instanceId: "claudeAgent",
        status: "error",
        authStatus: "unknown",
      }),
    ]);
    expect(entry && resolveProviderInstanceReadiness(entry)).toBe("needsAuth");
  });

  it("otherError for a probe failure unrelated to install/auth (installed, authenticated, still not ready)", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        provider: ProviderDriverKind.make("codex"),
        instanceId: "codex",
        status: "error",
        authStatus: "authenticated",
      }),
    ]);
    expect(entry && resolveProviderInstanceReadiness(entry)).toBe("otherError");
  });

  it("otherError (genuinely disabled) for a disabled-in-settings instance, never needsAuth/needsInstall", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        provider: ProviderDriverKind.make("claudeAgent"),
        instanceId: "claudeAgent",
        enabled: false,
        status: "warning",
        installed: false,
        authStatus: "unknown",
      }),
    ]);
    expect(entry && resolveProviderInstanceReadiness(entry)).toBe("otherError");
  });

  it("otherError for a driver unavailable in this build, never needsAuth/needsInstall", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        provider: ProviderDriverKind.make("cursor"),
        instanceId: "cursor",
        availability: "unavailable",
        status: "error",
        installed: false,
      }),
    ]);
    expect(entry && resolveProviderInstanceReadiness(entry)).toBe("otherError");
  });
});

describe("isProviderInstanceConnectable", () => {
  it("is true for needsInstall and needsAuth", () => {
    const [needsInstall, needsAuth] = deriveProviderInstanceEntries([
      provider({
        provider: ProviderDriverKind.make("codex"),
        instanceId: "codex",
        status: "error",
        installed: false,
      }),
      provider({
        provider: ProviderDriverKind.make("claudeAgent"),
        instanceId: "claudeAgent",
        status: "error",
        authStatus: "unknown",
      }),
    ]);
    expect(needsInstall && isProviderInstanceConnectable(needsInstall)).toBe(true);
    expect(needsAuth && isProviderInstanceConnectable(needsAuth)).toBe(true);
  });

  it("is false for ready, otherError, and genuinely-disabled instances", () => {
    const [ready, otherError, disabled] = deriveProviderInstanceEntries([
      provider({ provider: ProviderDriverKind.make("codex"), instanceId: "codex" }),
      provider({
        provider: ProviderDriverKind.make("codex"),
        instanceId: "codex_personal",
        status: "error",
      }),
      provider({
        provider: ProviderDriverKind.make("claudeAgent"),
        instanceId: "claudeAgent",
        enabled: false,
        status: "warning",
      }),
    ]);
    expect(ready && isProviderInstanceConnectable(ready)).toBe(false);
    expect(otherError && isProviderInstanceConnectable(otherError)).toBe(false);
    expect(disabled && isProviderInstanceConnectable(disabled)).toBe(false);
  });
});
