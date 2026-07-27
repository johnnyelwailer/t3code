import { describe, expect, it } from "@effect/vitest";

import {
  appendInstallLog,
  extractInstallErrorMessage,
  isActiveLoginPhase,
  isTerminalPhase,
  MAX_INSTALL_LOG_CHARS,
  timedOutInstallState,
} from "./t3team-installFlow.ts";

describe("appendInstallLog", () => {
  it("starts from undefined", () => {
    expect(appendInstallLog(undefined, "hello\n")).toBe("hello\n");
  });

  it("appends to the existing log", () => {
    expect(appendInstallLog("a\n", "b\n")).toBe("a\nb\n");
  });

  it("truncates from the front once over the cap", () => {
    const current = "x".repeat(MAX_INSTALL_LOG_CHARS);
    const next = appendInstallLog(current, "y");
    expect(next.length).toBe(MAX_INSTALL_LOG_CHARS);
    expect(next.endsWith("y")).toBe(true);
    expect(next.startsWith("x")).toBe(true);
  });
});

describe("extractInstallErrorMessage", () => {
  it("returns undefined for no log", () => {
    expect(extractInstallErrorMessage(undefined)).toBeUndefined();
  });

  it("returns undefined for a log with only blank lines", () => {
    expect(extractInstallErrorMessage("\n\n  \n")).toBeUndefined();
  });

  it("returns the last non-empty lines, not the first — npm prints errors at the tail", () => {
    const log = [
      "npm warn deprecated something",
      "added 1 package in 2s",
      "",
      "npm ERR! code E403",
      "npm ERR! 403 Forbidden - GET https://registry.npmjs.org/@openai/codex",
    ].join("\n");
    const message = extractInstallErrorMessage(log);
    expect(message).toContain("npm ERR! 403 Forbidden");
    expect(message).not.toContain("npm warn deprecated");
  });

  it("caps the extracted message length", () => {
    const longLine = "npm ERR! ".concat("x".repeat(1000));
    expect(extractInstallErrorMessage(longLine)!.length).toBeLessThanOrEqual(500);
  });
});

describe("isActiveLoginPhase", () => {
  it("is true for the in-flight login phases", () => {
    expect(isActiveLoginPhase("starting")).toBe(true);
    expect(isActiveLoginPhase("awaiting-open")).toBe(true);
    expect(isActiveLoginPhase("awaiting-code")).toBe(true);
    expect(isActiveLoginPhase("verifying")).toBe(true);
  });

  it("is false for installing — no login pty exists yet, must not short-circuit the chain", () => {
    expect(isActiveLoginPhase("installing")).toBe(false);
  });

  it("is false for idle/terminal phases", () => {
    expect(isActiveLoginPhase("idle")).toBe(false);
    expect(isActiveLoginPhase("connected")).toBe(false);
    expect(isActiveLoginPhase("failed")).toBe(false);
    expect(isActiveLoginPhase("expired")).toBe(false);
  });
});

describe("isTerminalPhase", () => {
  it("is true only for connected/failed/expired", () => {
    expect(isTerminalPhase("connected")).toBe(true);
    expect(isTerminalPhase("failed")).toBe(true);
    expect(isTerminalPhase("expired")).toBe(true);
  });

  it("is false for idle, installing, and the active login phases", () => {
    expect(isTerminalPhase("idle")).toBe(false);
    expect(isTerminalPhase("installing")).toBe(false);
    expect(isTerminalPhase("starting")).toBe(false);
    expect(isTerminalPhase("awaiting-open")).toBe(false);
    expect(isTerminalPhase("awaiting-code")).toBe(false);
    expect(isTerminalPhase("verifying")).toBe(false);
  });
});

describe("timedOutInstallState", () => {
  it("builds a failed state with a message naming the timeout", () => {
    const state = timedOutInstallState("claude", "5 minutes");
    expect(state).toEqual({
      tool: "claude",
      phase: "failed",
      message: "Install timed out after 5 minutes.",
    });
  });
});
