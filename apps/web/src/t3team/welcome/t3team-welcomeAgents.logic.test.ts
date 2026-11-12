import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";

import { buildWelcomeAgentRows, isWelcomeAgentReady } from "./t3team-welcomeAgents.logic";

function provider(driver: string, overrides: Partial<ServerProvider> = {}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(`${driver}-1`),
    driver,
    displayName: driver === "claudeAgent" ? "Claude Code" : driver,
    enabled: true,
    installed: true,
    status: "ready",
    auth: { status: "authenticated" },
    models: [],
    ...overrides,
  } as ServerProvider;
}

describe("buildWelcomeAgentRows", () => {
  it("always lists Nexplore AI, Claude Code, Codex and Cursor", () => {
    const rows = buildWelcomeAgentRows([]);
    expect(rows.map((row) => row.driver)).toEqual(["nexplore", "claudeAgent", "codex", "cursor"]);
  });

  it("maps Claude/Codex missing binaries to ToolAuth install actions", () => {
    const rows = buildWelcomeAgentRows([]);
    expect(rows.find((row) => row.driver === "claudeAgent")?.action).toEqual({
      kind: "toolAuthInstall",
      tool: "claude",
    });
    expect(rows.find((row) => row.driver === "codex")?.action).toEqual({
      kind: "toolAuthInstall",
      tool: "codex",
    });
  });

  it("maps a ready Nexplore AI provider to a ready row with no action", () => {
    const rows = buildWelcomeAgentRows([provider("nexplore", { displayName: "Nexplore AI" })]);
    const nexplore = rows.find((row) => row.driver === "nexplore");
    expect(nexplore?.state).toBe("ready");
    expect(nexplore?.action).toEqual({ kind: "none" });
    expect(nexplore?.description).toBeNull();
    expect(isWelcomeAgentReady(rows)).toBe(true);
  });

  it("never asks Nexplore AI to sign in or set up; unreachable is a muted hint only", () => {
    const signedOut = buildWelcomeAgentRows([
      provider("nexplore", {
        displayName: "Nexplore AI",
        status: "ready",
        auth: { status: "unauthenticated" },
      }),
    ]).find((row) => row.driver === "nexplore");
    expect(signedOut?.state).toBe("ready");
    expect(signedOut?.action).toEqual({ kind: "none" });
    expect(signedOut?.statusLabel).toBe("Ready");

    const unreachable = buildWelcomeAgentRows([
      provider("nexplore", {
        displayName: "Nexplore AI",
        status: "error",
        message: "gateway timed out",
        auth: { status: "unknown" },
      }),
    ]).find((row) => row.driver === "nexplore");
    expect(unreachable?.action).toEqual({ kind: "none" });
    expect(unreachable?.statusLabel).toBeNull();
    expect(unreachable?.description).toBe("Not reachable on this network");

    const missing = buildWelcomeAgentRows([]).find((row) => row.driver === "nexplore");
    expect(missing?.action).toEqual({ kind: "none" });
    expect(missing?.description).toBe("Not reachable on this network");
  });

  it("offers no button for an agent without an in-page install: the page never leaves", () => {
    const rows = buildWelcomeAgentRows([
      provider("cursor", {
        installed: false,
        status: "error",
        auth: { status: "unknown" },
        setup: { canInstall: true, canAuthenticate: true },
      }),
    ]);
    const cursor = rows.find((row) => row.driver === "cursor");
    expect(cursor?.action.kind).toBe("disabled");
  });

  it("appends other enabled providers after the preferred list", () => {
    const rows = buildWelcomeAgentRows([provider("opencode"), provider("grok")]);
    expect(rows.map((row) => row.driver)).toEqual([
      "nexplore",
      "claudeAgent",
      "codex",
      "cursor",
      "grok",
      "opencode",
    ]);
  });
});
