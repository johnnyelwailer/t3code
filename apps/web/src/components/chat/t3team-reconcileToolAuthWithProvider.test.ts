import { ProviderInstanceId, type ToolAuthState } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ProviderInstanceEntry } from "../../providerInstances";
import {
  classifyProviderRefreshResult,
  isProviderAuthUnauthenticated,
  reconcileToolAuthWithProvider,
} from "./t3team-reconcileToolAuthWithProvider";

const connected = { tool: "claude", phase: "connected", account: "ada" } as ToolAuthState;
const awaiting = { tool: "claude", phase: "awaiting-code" } as ToolAuthState;

const entry = (
  auth: "authenticated" | "unauthenticated" | "unknown",
  ready = false,
): ProviderInstanceEntry =>
  ({
    instanceId: ProviderInstanceId.make("claude"),
    enabled: true,
    isAvailable: true,
    status: ready ? "ready" : "warning",
    snapshot: { auth: { status: auth } },
  }) as ProviderInstanceEntry;

describe("reconcileToolAuthWithProvider", () => {
  it("presents a connected-but-lapsed grant as expired, and leaves mid-flow alone", () => {
    expect(reconcileToolAuthWithProvider(connected, "unauthenticated")?.phase).toBe("expired");
    expect(reconcileToolAuthWithProvider(connected, "authenticated")).toBe(connected);
    expect(reconcileToolAuthWithProvider(awaiting, "unauthenticated")).toBe(awaiting);
    expect(reconcileToolAuthWithProvider(undefined, "unauthenticated")).toBeUndefined();
  });
});

describe("classifyProviderRefreshResult", () => {
  it("is ready, unauthenticated, or notReady — never a loop on a lapsed account", () => {
    expect(classifyProviderRefreshResult(entry("authenticated", true))).toBe("ready");
    expect(classifyProviderRefreshResult(entry("unauthenticated"))).toBe("unauthenticated");
    expect(classifyProviderRefreshResult(entry("authenticated"))).toBe("notReady");
    expect(classifyProviderRefreshResult(entry("unknown"))).toBe("notReady");
    expect(classifyProviderRefreshResult(undefined)).toBe("notReady");
  });
});

describe("isProviderAuthUnauthenticated", () => {
  it("is true only for the probe status Settings already calls Not authenticated", () => {
    expect(isProviderAuthUnauthenticated(entry("unauthenticated"))).toBe(true);
    expect(isProviderAuthUnauthenticated(entry("authenticated"))).toBe(false);
    expect(isProviderAuthUnauthenticated(entry("unknown"))).toBe(false);
    expect(isProviderAuthUnauthenticated(undefined)).toBe(false);
  });
});
