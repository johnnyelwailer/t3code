import { describe, expect, it } from "@effect/vitest";

import { CLAUDE, CODEX, FAKE } from "./t3team-adapters.ts";
import { GH, ghAdapter } from "./t3team-ghAdapter.ts";
import { advance, assemblePtyRead, foldPtyRead, stripAnsi } from "./t3team-advance.ts";
import type { AuthState } from "./t3team-types.ts";

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

      const withUrl: AuthState = {
        tool: "claude",
        phase: "awaiting-open",
        url: "https://claude.ai/x",
      };
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
      const prev: AuthState = {
        tool: "codex",
        phase: "awaiting-open",
        url: "https://auth.openai.com/x",
      };
      const next = advance(prev, "Successfully logged in", CODEX);
      expect(next.phase).toBe("connected");
    });

    it("moves to failed when the device code path is unavailable", () => {
      const next = advance(idle("codex"), "Device code login is not enabled", CODEX);
      expect(next.phase).toBe("failed");
    });
  });

  describe("GitHub (GHE device flow: code displayed, Enter auto-answered)", () => {
    // The verbatim lines gh 2.96.0 printed in an 80x30 pty on nexplore.ghe.com
    // (ANSI-stripped) — these fixtures are captures, not guesses.
    const CODE_LINE = "! First copy your one-time code: B4A0-AA8E";
    const ENTER_LINE =
      "Press Enter to open https://nexplore.ghe.com/login/device in your browser...";

    it("captures the display code from the code line, without leaving starting yet (no URL yet)", () => {
      const next = advance({ tool: "gh", phase: "starting" }, CODE_LINE, GH);
      expect(next.displayCode).toBe("B4A0-AA8E");
      expect(next.phase).toBe("starting");
      expect(next.url).toBeUndefined();
    });

    it("captures the device URL and moves to awaiting-open on the press-enter line", () => {
      const withCode: AuthState = { tool: "gh", phase: "starting", displayCode: "B4A0-AA8E" };
      const next = advance(withCode, ENTER_LINE, GH);
      expect(next.phase).toBe("awaiting-open");
      expect(next.url).toBe("https://nexplore.ghe.com/login/device");
      expect(next.displayCode).toBe("B4A0-AA8E");
    });

    it("moves to connected on gh's success lines", () => {
      const prev: AuthState = {
        tool: "gh",
        phase: "awaiting-open",
        url: "https://nexplore.ghe.com/login/device",
      };
      expect(advance(prev, "Authentication complete.", GH).phase).toBe("connected");
      const again: AuthState = { tool: "gh", phase: "awaiting-open" };
      const next = advance(again, "Logged in to nexplore.ghe.com account pj (keyring)", GH);
      expect(next.phase).toBe("connected");
    });

    it("moves to failed on gh's failure and timeout lines", () => {
      expect(
        advance(idle("gh"), "Failed to log in to nexplore.ghe.com account pj (keyring)", GH).phase,
      ).toBe("failed");
      const timedOut = advance(
        idle("gh"),
        "Timeout trying to log in to nexplore.ghe.com using token (keyring)",
        GH,
      );
      expect(timedOut.phase).toBe("failed");
    });

    it("autoEnter matches only the press-enter line", () => {
      expect(GH.match.autoEnter?.test(ENTER_LINE)).toBe(true);
      expect(GH.match.autoEnter?.test(CODE_LINE)).toBe(false);
      expect(GH.match.autoEnter?.test("Authentication complete.")).toBe(false);
    });

    it("does not let the display code capture a 4-4 fragment embedded in a URL", () => {
      // Same trap as Codex: the URL line must not masquerade as a code.
      const next = advance(idle("gh"), "visit https://nexplore.ghe.com/login/device now", GH);
      expect(next.displayCode).toBeUndefined();
    });

    it("adapts to a non-default GHE host", () => {
      const other = ghAdapter("github.corp.example");
      const next = advance(
        idle("gh"),
        "Press Enter to open https://github.corp.example/login/device in your browser...",
        other,
      );
      expect(next.phase).toBe("awaiting-open");
      expect(next.url).toBe("https://github.corp.example/login/device");
      const logged = advance(
        { tool: "gh", phase: "awaiting-open" },
        "Logged in to github.corp.example account pj (keyring)",
        other,
      );
      expect(logged.phase).toBe("connected");
    });
  });

  describe("the fake fixture adapter (used so tests never touch real OAuth)", () => {
    it("exercises the full three-beat flow: url -> awaiting-code -> connected", () => {
      let state = idle("fake");
      state = advance(state, "Opening browser for sign-in…", FAKE);
      expect(state.phase).toBe("idle");

      state = advance(
        state,
        "If it does not open, visit: https://example.invalid/device/AbC123",
        FAKE,
      );
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
    const prev: AuthState = {
      tool: "fake",
      phase: "awaiting-code",
      url: "https://example.invalid/x",
    };
    const next = advance(prev, "some unrelated noise\n", FAKE);
    expect(next.phase).toBe("awaiting-code");
    expect(next.url).toBe("https://example.invalid/x");
  });
});

// Built from escape codes, not literal control characters, so the source
// file itself stays plain text.
const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

describe("pty read assembly (chunk boundaries)", () => {
  const AUTHORIZE_URL =
    "https://claude.ai/oauth/authorize?code=true&client_id=abc123&scope=user%3Ainference";

  /** Drives a sequence of pty reads the way the process layer does. */
  function feed(chunks: ReadonlyArray<string>, opts?: { readonly exit?: boolean }): AuthState {
    let state = idle("claude");
    let pending = "";
    for (const chunk of chunks) {
      const read = assemblePtyRead(pending, chunk);
      pending = read.pending;
      state = foldPtyRead(state, read, CLAUDE);
    }
    if (opts?.exit) {
      state = foldPtyRead(state, assemblePtyRead(pending, "", { flush: true }), CLAUDE);
    }
    return state;
  }

  it("captures the WHOLE url when a read splits it mid-string", () => {
    const line = `Visit: ${AUTHORIZE_URL}\n`;
    // A pty splits wherever it likes. Matching each raw chunk independently
    // captured "https://claude.ai/oauth/authorize" — query string amputated —
    // and still reported awaiting-open, sending the human to a broken page.
    const split = feed([line.slice(0, 40), line.slice(40)]);
    expect(split.phase).toBe("awaiting-open");
    expect(split.url).toBe(AUTHORIZE_URL);
    expect(feed([line]).url).toBe(AUTHORIZE_URL);
  });

  it("survives a url split one character at a time", () => {
    const state = feed([...`Visit: ${AUTHORIZE_URL}\n`]);
    expect(state.url).toBe(AUTHORIZE_URL);
  });

  it("never captures a value from an incomplete line", () => {
    // No newline yet: the url is still arriving, so nothing may be captured.
    const state = feed([`Visit: ${AUTHORIZE_URL.slice(0, 45)}`]);
    expect(state.url).toBeUndefined();
    expect(state.phase).toBe("idle");
  });

  it("defers a url that runs to the very end of the partial (still growing)", () => {
    // The url so far is complete-looking, but nothing terminates it within the
    // partial — the next read may extend the token. Deferring is the safe
    // direction; this is the truncation trap the complete-line rule exists for.
    const state = feed([`Visit: ${AUTHORIZE_URL}`]);
    expect(state.url).toBeUndefined();
    expect(state.phase).toBe("idle");
  });

  it("captures a closed url from the partial when terminator content follows it", () => {
    // The url is followed by prose within the same (still incomplete) line, so
    // the token is closed and the capture is stable even without the newline.
    const state = feed([`Visit: ${AUTHORIZE_URL} (open in your browser)`]);
    expect(state.url).toBe(AUTHORIZE_URL);
    expect(state.phase).toBe("awaiting-open");
  });

  it("surfaces gh's device url on the press-enter line that never gets a newline", () => {
    // gh prints "Press Enter to open <url> in your browser..." and then blocks
    // on the keypress — through a real pty that line often stays the
    // incomplete trailing line (verified live: it sat in `partial` for 30s).
    // The code line is complete; the prompt line is not. The url must still
    // surface so the card can show it, and the flow must reach awaiting-open.
    const read = assemblePtyRead(
      "",
      "! First copy your one-time code: 4148-FBA3\r\n" +
        "Press Enter to open https://nexplore.ghe.com/login/device in your browser... ",
    );
    const state = foldPtyRead({ tool: "gh", phase: "starting" }, read, GH);
    expect(state.displayCode).toBe("4148-FBA3");
    expect(state.url).toBe("https://nexplore.ghe.com/login/device");
    expect(state.phase).toBe("awaiting-open");
  });

  it("still detects a blocking prompt that never sends a newline", () => {
    // Real CLIs print "Paste code here:" and then block, so waiting for a
    // newline here would stall the flow on a prompt already received.
    const state = feed([`Visit: ${AUTHORIZE_URL}\n`, "Paste code here if prompted:"]);
    expect(state.phase).toBe("awaiting-code");
  });

  it("folds a final line that carries no newline when the process exits", () => {
    const state = feed([`Visit: ${AUTHORIZE_URL}\n`, "Login successful"], { exit: true });
    expect(state.phase).toBe("connected");
  });

  it("strips an ANSI escape that is itself split across two reads", () => {
    // Colour codes straddle reads exactly like URLs do. Stripping each raw
    // chunk on arrival left the split CSI intact in the reassembled line, so
    // the prose matcher never fired and the flow stalled until process exit.
    // Split INSIDE the escape sequence itself: neither read carries a complete
    // CSI, so per-chunk stripping leaves it embedded in the reassembled line.
    const state = feed(["\u001B", "[32mLogin successful\u001B[0m\n"]);
    expect(state.phase).toBe("connected");
  });
});

describe("success and failure patterns colliding on one line", () => {
  it("treats a line matching BOTH patterns as success, not failure", () => {
    // These are broad prose matchers and one line can satisfy both. Reporting
    // a completed sign-in as failed is the worst direction to be wrong in: the
    // credential is on disk and working, and we would tell the user it is not.
    const next = advance(
      { tool: "claude", phase: "awaiting-code" },
      "Login successful; expired credentials removed",
      CLAUDE,
    );
    expect(next.phase).toBe("connected");
  });

  it("still reports a genuine failure", () => {
    const next = advance(
      { tool: "claude", phase: "verifying" },
      "Login failed: invalid code",
      CLAUDE,
    );
    expect(next.phase).toBe("failed");
    expect(next.message).toContain("invalid code");
  });
});

describe("Codex device code must not be scraped out of the sign-in URL", () => {
  it("ignores a code-shaped fragment inside a URL path", () => {
    const next = advance(
      idle("codex"),
      "Visit https://auth.openai.com/device/ABCD-1234 to continue",
      CODEX,
    );
    // The URL is captured; the path fragment must NOT become the device code,
    // or the UI tells the user to type part of the link they just opened.
    expect(next.url).toContain("auth.openai.com");
    expect(next.displayCode).toBeUndefined();
  });

  it("still captures a standalone device code", () => {
    const next = advance(idle("codex"), "Your code is WDJB-MJHT", CODEX);
    expect(next.displayCode).toBe("WDJB-MJHT");
  });
});

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
