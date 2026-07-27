import { describe, expect, it } from "@effect/vitest";

import { CLAUDE, CODEX, FAKE } from "./adapters.ts";
import { advance, stripAnsi } from "./advance.ts";
import type { AuthState } from "./types.ts";

const idle = (tool: string): AuthState => ({ tool, phase: "idle" });

describe("advance", () => {
  describe("Claude (awaiting-code flow: no device flow, human brings a code back)", () => {
    it("moves idle -> awaiting-open when the CLI prints the sign-in URL", () => {
      const next = advance(
        idle("claude"),
        "If it does not open, visit: https://claude.ai/oauth/authorize?foo=bar",
        CLAUDE,
      );
      expect(next.phase).toBe("awaiting-open");
      expect(next.url).toBe("https://claude.ai/oauth/authorize?foo=bar");
    });

    it("moves awaiting-open -> awaiting-code once the paste-code hint appears, but only after a URL", () => {
      const beforeUrl = advance(idle("claude"), "Paste code here if prompted:", CLAUDE);
      expect(beforeUrl.phase).toBe("idle");

      const withUrl: AuthState = { tool: "claude", phase: "awaiting-open", url: "https://claude.ai/x" };
      const next = advance(withUrl, "Paste code here if prompted:", CLAUDE);
      expect(next.phase).toBe("awaiting-code");
    });

    it("moves to connected on a success line, clearing any message", () => {
      const prev: AuthState = {
        tool: "claude",
        phase: "verifying",
        message: "checking...",
      };
      const next = advance(prev, "Login successful", CLAUDE);
      expect(next.phase).toBe("connected");
      expect(next.message).toBeUndefined();
    });

    it("moves to failed on a failure line, capturing the CLI's own first line as the message", () => {
      const prev: AuthState = { tool: "claude", phase: "verifying" };
      const next = advance(prev, "Authentication failed: invalid code\nsome more detail", CLAUDE);
      expect(next.phase).toBe("failed");
      expect(next.message).toBe("Authentication failed: invalid code");
    });

    it("checks success/failure before the URL/prompt matchers, per the fold's documented order", () => {
      // A CLI that echoes the URL and immediately reports success in the same
      // chunk must not be left sitting in awaiting-open.
      const next = advance(
        idle("claude"),
        "If it does not open, visit: https://claude.ai/x\nLogin successful",
        CLAUDE,
      );
      expect(next.phase).toBe("connected");
    });

    it("truncates an overlong failure message to 200 characters", () => {
      const longLine = `Authentication failed: ${"x".repeat(300)}`;
      const next = advance(idle("claude"), longLine, CLAUDE);
      expect(next.phase).toBe("failed");
      expect(next.message?.length).toBe(200);
    });
  });

  describe("Codex (device flow: a code is displayed, nothing comes back to us)", () => {
    it("moves idle -> awaiting-open and captures the display code, with no awaiting-code phase", () => {
      const withUrl = advance(
        idle("codex"),
        "Visit https://auth.openai.com/device and enter the code",
        CODEX,
      );
      expect(withUrl.phase).toBe("awaiting-open");
      expect(withUrl.url).toBe("https://auth.openai.com/device");

      const withCode = advance(withUrl, "Your code: ABCD-1234", CODEX);
      expect(withCode.displayCode).toBe("ABCD-1234");
      // Codex has no `awaitingCode` matcher — the phase must never become
      // `awaiting-code`, since nothing is ever sent back to us.
      expect(withCode.phase).toBe("awaiting-open");
    });

    it("moves to connected on success", () => {
      const prev: AuthState = { tool: "codex", phase: "awaiting-open", url: "https://auth.openai.com/x" };
      const next = advance(prev, "Successfully logged in", CODEX);
      expect(next.phase).toBe("connected");
    });

    it("moves to failed when the device code path is unavailable", () => {
      const next = advance(idle("codex"), "Device code login is not enabled", CODEX);
      expect(next.phase).toBe("failed");
    });
  });

  describe("the fake fixture adapter (used so tests never touch real OAuth)", () => {
    it("exercises the full three-beat flow: url -> awaiting-code -> connected", () => {
      let state = idle("fake");
      state = advance(state, "Opening browser for sign-in…", FAKE);
      expect(state.phase).toBe("idle");

      state = advance(state, "If it does not open, visit: https://example.invalid/device/AbC123", FAKE);
      expect(state.phase).toBe("awaiting-open");
      expect(state.url).toBe("https://example.invalid/device/AbC123");

      state = advance(state, "Paste code here if prompted:", FAKE);
      expect(state.phase).toBe("awaiting-code");

      state = advance(state, "Login successful", FAKE);
      expect(state.phase).toBe("connected");
    });

    it("fails on an invalid code", () => {
      const prev: AuthState = { tool: "fake", phase: "verifying" };
      const next = advance(prev, "Login failed: invalid code", FAKE);
      expect(next.phase).toBe("failed");
    });
  });

  it("never regresses phase when a chunk carries no recognizable signal", () => {
    const prev: AuthState = { tool: "fake", phase: "awaiting-code", url: "https://example.invalid/x" };
    const next = advance(prev, "some unrelated noise\n", FAKE);
    expect(next.phase).toBe("awaiting-code");
    expect(next.url).toBe("https://example.invalid/x");
  });
});

// Built from escape codes, not literal control characters, so the source
// file itself stays plain text.
const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

describe("stripAnsi", () => {
  it("removes CSI sequences (color, cursor movement) without touching the text", () => {
    const chunk = `${ESC}[1mLogin successful${ESC}[0m${ESC}[2K${ESC}[1G`;
    expect(stripAnsi(chunk)).toBe("Login successful");
  });

  it("removes OSC sequences terminated by BEL or ST", () => {
    const belTerminated = `${ESC}]0;window title${BEL}visible text`;
    const stTerminated = `${ESC}]0;window title${ESC}\\visible text`;
    expect(stripAnsi(belTerminated)).toBe("visible text");
    expect(stripAnsi(stTerminated)).toBe("visible text");
  });

  it("removes simple Fe escapes (save/restore cursor, reverse index)", () => {
    // The stripped class is `[0-9@-Z\]^_]` — digits and uppercase-range final
    // bytes (ESC 7 save cursor, ESC 8 restore, ESC M reverse index).
    expect(stripAnsi(`${ESC}7before${ESC}8after${ESC}M`)).toBe("beforeafter");
  });

  it("normalizes CRLF and lone CR to LF", () => {
    expect(stripAnsi("line one\r\nline two\rline three")).toBe("line one\nline two\nline three");
  });

  it("leaves plain prose untouched", () => {
    const prose = "If it does not open, visit: https://claude.ai/oauth/authorize?foo=bar";
    expect(stripAnsi(prose)).toBe(prose);
  });
});
