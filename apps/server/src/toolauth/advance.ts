/**
 * Pure fold from CLI output to UI state. No process, no clock -- the
 * interesting part of driving a login flow is testable without spawning
 * anything.
 *
 * Ported unchanged in behaviour from
 * `prototypes/hosted-sandbox/lib/toolauth/session.ts`'s `advance()`.
 *
 * @module toolauth/advance
 */
import type { AuthState, ToolAuthAdapter } from "./types.ts";

/**
 * Fold one chunk of CLI output into the next state.
 *
 * Order matters: success and failure are checked before the prompts, because
 * a CLI that prints "login successful" after echoing the URL must not be left
 * sitting in `awaiting-open`.
 *
 * The pty layer is responsible for stripping ANSI/control sequences and
 * normalizing CRLF before calling this -- never done here, so this stays a
 * plain-text fold that's trivial to unit test.
 */
export function advance(prev: AuthState, chunk: string, adapter: ToolAuthAdapter): AuthState {
  const next: AuthState = { ...prev };
  const m = adapter.match;

  if (m.failure?.test(chunk)) {
    return { ...next, phase: "failed", message: firstLine(chunk) };
  }
  if (m.success.test(chunk)) {
    return { ...next, phase: "connected", message: undefined };
  }

  const url = chunk.match(m.url)?.[1];
  if (url) {
    next.url = url;
    if (next.phase === "idle" || next.phase === "starting") next.phase = "awaiting-open";
  }

  const code = m.displayCode ? chunk.match(m.displayCode)?.[1] : undefined;
  if (code) next.displayCode = code;

  // Only meaningful once a URL exists -- some CLIs print the hint up front.
  if (m.awaitingCode?.test(chunk) && next.url) next.phase = "awaiting-code";

  return next;
}

function firstLine(s: string): string {
  return s.trim().split("\n")[0]?.slice(0, 200) ?? "";
}

// Real ptys emit VT100/ANSI control sequences for color, cursor movement,
// clearing lines, and window-title changes. advance()'s matchers are
// plain-text regexes over CLI prose ("login successful", a URL, ...) and
// must not have to know about escape codes, so stripping happens here, in
// the process layer, per the spec -- never inside advance().
//
// Covers: OSC (title/hyperlink, terminated by BEL or ST), CSI (color/cursor/
// clear -- the overwhelming majority of what CLIs emit), 2-argument charset
// designation (ESC ( B), and the single-argument Fe escapes (ESC 7 save
// cursor, ESC 8 restore, ESC c reset, ...). Not a complete VT100 parser --
// doesn't need to be, only needs to stop these bytes from defeating a prose
// regex. Ported from prototypes/hosted-sandbox/lib/toolauth/pty.ts.
const ANSI_PATTERN = new RegExp(
  [
    "\\u001B\\][\\s\\S]*?(?:\\u0007|\\u001B\\\\)", // OSC ... BEL or ST
    "\\u001B\\[[0-9;?]*[ -/]*[@-~]", // CSI ... final byte
    "\\u001B[()#][0-9A-Za-z]", // charset designation
    "\\u001B[0-9@-Z\\\\\\]^_]", // simple Fe escapes
  ].join("|"),
  "g",
);

/**
 * Strips ANSI/control sequences and normalizes CRLF/CR to LF. pty output
 * always carries these -- the process layer (ToolAuthService.ts) runs this
 * before feeding chunks to advance() so the fold above only ever sees plain
 * text.
 */
export function stripAnsi(chunk: string): string {
  return chunk.replace(ANSI_PATTERN, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
