import { ProviderDriverKind, type ProviderInstanceConfigMap } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { adapterForAccount, isConfiguredBinaryPath } from "./t3team-loginAccount.ts";
import { loginAccountFromInstances } from "./t3team-loginAccountSettings.ts";
import { CLAUDE } from "./t3team-adapters.ts";

describe("isConfiguredBinaryPath", () => {
  it("treats the empty value and the driver default as not configured", () => {
    expect(isConfiguredBinaryPath("", "claude")).toBe(false);
    expect(isConfiguredBinaryPath("  ", "claude")).toBe(false);
    expect(isConfiguredBinaryPath("claude", "claude")).toBe(false);
    expect(isConfiguredBinaryPath("/accounts/mon/claude", "claude")).toBe(true);
    expect(isConfiguredBinaryPath("C:\\\\Accounts\\\\Mon\\\\claude.exe", "claude")).toBe(true);
    expect(isConfiguredBinaryPath("claude-mon", "claude")).toBe(true);
  });
});

describe("adapterForAccount", () => {
  it("points login and the status probe at the same binary, and carries the account env", () => {
    const adapter = adapterForAccount(CLAUDE, "/accounts/mon/claude", {
      CLAUDE_CONFIG_DIR: "/accounts/mon/home",
    });
    expect(adapter.command).toEqual(["/accounts/mon/claude", "auth", "login"]);
    expect(adapter.status.probe).toEqual(["/accounts/mon/claude", "auth", "status", "--json"]);
    expect(adapter.spawnEnv?.CLAUDE_CONFIG_DIR).toBe("/accounts/mon/home");
  });
});

describe("loginAccountFromInstances", () => {
  const mon: ProviderInstanceConfigMap[string] = {
    driver: ProviderDriverKind.make("claudeAgent"),
    displayName: "Mon",
    config: { binaryPath: "/accounts/mon/claude", homePath: "/accounts/mon/home" },
  };
  const wed: ProviderInstanceConfigMap[string] = {
    driver: ProviderDriverKind.make("claudeAgent"),
    displayName: "Wed",
    config: { binaryPath: "/accounts/wed/claude", homePath: "/accounts/wed/home" },
  };
  const instances: ProviderInstanceConfigMap = { mon, wed };

  it("resolves a configured path and config dir per account", () => {
    expect(loginAccountFromInstances("claude", "mon", instances)).toEqual({
      instanceId: "mon",
      binaryPath: "/accounts/mon/claude",
      homePath: "/accounts/mon/home",
      instanceEnvironment: undefined,
    });
  });

  it("keeps two accounts on different binaries", () => {
    const monAccount = loginAccountFromInstances("claude", "mon", instances);
    const wedAccount = loginAccountFromInstances("claude", "wed", instances);
    expect(monAccount?.binaryPath).toBe("/accounts/mon/claude");
    expect(wedAccount?.binaryPath).toBe("/accounts/wed/claude");
    expect(monAccount?.homePath).not.toBe(wedAccount?.homePath);
  });

  it("returns undefined when several accounts exist and no instance id is given", () => {
    expect(loginAccountFromInstances("claude", undefined, instances)).toBeUndefined();
  });

  it("uses the only instance of that driver when no instance id is given", () => {
    const only = loginAccountFromInstances("claude", undefined, { mon });
    expect(only?.instanceId).toBe("mon");
    expect(only?.binaryPath).toBe("/accounts/mon/claude");
  });
});
