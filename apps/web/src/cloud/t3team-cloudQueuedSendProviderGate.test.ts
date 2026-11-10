import type { ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  cloudQueuedSendProviderReady,
  resolveCloudQueuedSendProviderGate,
} from "./t3team-cloudQueuedSendProviderGate";

const claude = (over: Partial<ServerProvider> = {}): ServerProvider =>
  ({
    instanceId: "claudeAgent",
    driver: "claudeAgent",
    enabled: true,
    installed: true,
    status: "error",
    auth: { status: "unauthenticated" },
    ...over,
  }) as ServerProvider;

describe("resolveCloudQueuedSendProviderGate", () => {
  it("waits until the remote provider list exists", () => {
    expect(
      resolveCloudQueuedSendProviderGate({ instanceId: "claudeAgent", providers: null }).kind,
    ).toBe("wait");
  });

  it("needsInstall before needsAuth when the CLI is missing", () => {
    expect(
      resolveCloudQueuedSendProviderGate({
        instanceId: "claudeAgent",
        providers: [claude({ installed: false, auth: { status: "unknown" } })],
      }),
    ).toEqual({ kind: "needsInstall", tool: "claude" });
  });

  it("needsAuth for an installed but unsigned Claude, and ready once ToolAuth connects", () => {
    expect(
      resolveCloudQueuedSendProviderGate({
        instanceId: "claudeAgent",
        providers: [claude()],
      }),
    ).toEqual({ kind: "needsAuth", tool: "claude" });
    expect(
      resolveCloudQueuedSendProviderGate({
        instanceId: "claudeAgent",
        providers: [claude()],
        toolAuthPhase: "connected",
      }).kind,
    ).toBe("ready");
  });

  it("waits through install/sign-in phases and fails once with the ToolAuth message", () => {
    expect(
      resolveCloudQueuedSendProviderGate({
        instanceId: "claudeAgent",
        providers: [claude({ installed: false })],
        toolAuthPhase: "installing",
      }).kind,
    ).toBe("wait");
    expect(
      resolveCloudQueuedSendProviderGate({
        instanceId: "claudeAgent",
        providers: [claude()],
        toolAuthPhase: "failed",
        toolAuthMessage: "npm ERR! 403",
      }),
    ).toEqual({ kind: "failed", message: "npm ERR! 403" });
  });

  it("treats a disabled provider as one failed Markdown message, not a toast storm", () => {
    const gate = resolveCloudQueuedSendProviderGate({
      instanceId: "claudeAgent",
      providers: [claude({ enabled: false })],
    });
    expect(gate.kind).toBe("failed");
    expect(cloudQueuedSendProviderReady(gate)).toBe(false);
  });

  it("does not block drivers without a ToolAuth flow", () => {
    expect(
      resolveCloudQueuedSendProviderGate({
        instanceId: "cursor",
        providers: [
          {
            instanceId: "cursor",
            driver: "cursor",
            enabled: true,
            installed: true,
            status: "ready",
            auth: { status: "authenticated" },
          } as ServerProvider,
        ],
      }).kind,
    ).toBe("ready");
  });
});
