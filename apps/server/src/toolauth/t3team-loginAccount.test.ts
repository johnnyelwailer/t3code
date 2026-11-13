import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstanceConfig,
  type ProviderInstanceConfigMap,
} from "@t3tools/contracts";
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
  const workId = ProviderInstanceId.make("work");
  const homeId = ProviderInstanceId.make("home");
  const work: ProviderInstanceConfig = {
    driver: ProviderDriverKind.make("claudeAgent"),
    displayName: "Work",
    config: { binaryPath: "/accounts/work/claude", homePath: "/accounts/work/home" },
  };
  const home: ProviderInstanceConfig = {
    driver: ProviderDriverKind.make("claudeAgent"),
    displayName: "Home",
    config: { binaryPath: "/accounts/home/claude", homePath: "/accounts/home/home" },
  };
  const instances: ProviderInstanceConfigMap = { [workId]: work, [homeId]: home };

  it("resolves a configured path and config dir per account", () => {
    expect(loginAccountFromInstances("claude", workId, instances)).toEqual({
      instanceId: workId,
      binaryPath: "/accounts/work/claude",
      homePath: "/accounts/work/home",
      instanceEnvironment: undefined,
    });
  });

  it("keeps two accounts on different binaries", () => {
    const workAccount = loginAccountFromInstances("claude", workId, instances);
    const homeAccount = loginAccountFromInstances("claude", homeId, instances);
    expect(workAccount?.binaryPath).toBe("/accounts/work/claude");
    expect(homeAccount?.binaryPath).toBe("/accounts/home/claude");
    expect(workAccount?.homePath).not.toBe(homeAccount?.homePath);
  });

  it("returns undefined when several accounts exist and no instance id is given", () => {
    expect(loginAccountFromInstances("claude", undefined, instances)).toBeUndefined();
  });

  it("uses the only instance of that driver when no instance id is given", () => {
    const only = loginAccountFromInstances("claude", undefined, { [workId]: work });
    expect(only?.instanceId).toBe(workId);
    expect(only?.binaryPath).toBe("/accounts/work/claude");
  });

  it("returns undefined for a string that is not a provider instance id", () => {
    expect(loginAccountFromInstances("claude", "not a valid id", instances)).toBeUndefined();
  });
});
