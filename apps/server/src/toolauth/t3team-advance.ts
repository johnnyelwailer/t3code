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
import type { AuthState, ToolAuthAdapter } from "./t3team-types.ts";

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

  // SUCCESS is checked first, deliberately. These patterns are broad prose
  // matchers and a single line can satisfy both — "Login successful; expired
  // credentials removed" matches `success` and also the failure alternative
  // `expired`. Checking failure first reported a completed sign-in as failed,
  // which is the worst possible direction to get wrong: the credential is on
  // disk and working, and we tell the user it did not work.
  //
  // The reverse collision is far less likely, because failure lines say so
  // explicitly ("login failed", "invalid code") and do not contain a success
  // phrase.
  if (m.success.test(chunk)) {
    return { ...next, phase: "connected", message: undefined };
  }
  if (m.failure?.test(chunk)) {
    return { ...next, phase: "failed", message: firstLine(chunk) };
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

/**
 * Folds one pty read into the next state, reassembling lines across reads.
 *
 * A pty never guarantees a read ends on a line boundary, and passing raw chunks
 * to `advance()` is quietly wrong rather than obviously broken. The authorize
 * URL is long and very likely to straddle two reads; `match.url` then matches
 * the FIRST half happily — its `[^\s"']+` simply stops at the chunk boundary —
 * so the session reaches `awaiting-open` holding a URL with its query string
 * amputated:
 *
 *   whole:  https://claude.ai/oauth/authorize?code=true&client_id=…&scope=…
 *   split:  https://claude.ai/oauth/authorize
 *
 * That is worse than missing it outright: the flow *looks* like it worked and
 * sends the human to a broken sign-in page. Fixtures never catch it (they write
 * whole lines in one go); a real CLI through a real pty does.
 *
 * So value-capturing matchers (`url`, `displayCode`) only ever see COMPLETE
 * lines. The trailing partial line is still checked for the `awaitingCode`
 * PROMPT, because that one is a boolean detector rather than a capture, and a
 * CLI that prints "Paste code here:" and then blocks never sends the newline
 * that would otherwise release it — waiting for one would stall the flow on a
 * prompt we had already received.
 *
 * `flush` (call on process exit) folds whatever partial line remains, for a CLI
 * whose final line has no newline.
 */
export interface AssembledPtyRead {
  /** Complete lines, safe for value-capturing matchers. */
  readonly lines: ReadonlyArray<string>;
  /** The incomplete trailing line — prompt detection only, never a capture. */
  readonly partial: string;
  /** Carry into the next read. */
  readonly pending: string;
}

/**
 * Split half — deliberately synchronous and separate from the fold, so the
 * process layer can advance its buffer in the `onData` callback itself. Doing
 * the buffer arithmetic inside an async fiber instead would let two reads
 * interleave at their suspension points and be folded out of order.
 */
export function assemblePtyRead(
  pending: string,
  chunk: string,
  options?: { readonly flush?: boolean },
): AssembledPtyRead {
  const combined = `${pending}${chunk}`;
  if (options?.flush) {
    return { lines: combined.split("\n"), partial: "", pending: "" };
  }
  const parts = combined.split("\n");
  const trailing = parts.pop() ?? "";
  // Bound the carry-over by keeping the TAIL, never by flushing it as a line:
  // flushing a half-URL would recreate the truncation this exists to prevent,
  // while a tail still completes once the rest of the line arrives.
  const carried =
    trailing.length > MAX_PENDING_CHARS ? trailing.slice(-MAX_PENDING_CHARS) : trailing;
  return { lines: parts, partial: carried, pending: carried };
}

/**
 * Fold half: complete lines through `advance()`, plus the prompt-only check.
 *
 * ANSI is stripped HERE, per assembled line, not per raw chunk. An escape
 * sequence straddles reads just like a URL does — `Login \x1b[31` + `m
 * successful` — and stripping each chunk on arrival leaves the split CSI
 * intact, so the reassembled line still carries `\x1b[31m` in the middle of the
 * prose and no matcher fires. Stripping after reassembly sees the whole
 * sequence and removes it.
 */
export function foldPtyRead(
  prev: AuthState,
  read: AssembledPtyRead,
  adapter: ToolAuthAdapter,
): AuthState {
  let state = prev;
  for (const rawLine of read.lines) {
    const line = stripAnsi(rawLine);
    if (line.length > 0) state = advance(state, line, adapter);
  }
  const partial = stripAnsi(read.partial);
  if (partial.length > 0 && adapter.match.awaitingCode?.test(partial) && state.url) {
    state = { ...state, phase: "awaiting-code" };
  }
  return state;
}

const MAX_PENDING_CHARS = 8_192;

/** Whether an auth state differs in any field a subscriber would render. Lives beside the
 * other pure auth-state helpers rather than in the service that publishes the updates. */
export function hasStateChanged(previous: AuthState, next: AuthState): boolean {
  return (
    previous.phase !== next.phase ||
    previous.url !== next.url ||
    previous.displayCode !== next.displayCode ||
    previous.message !== next.message ||
    previous.account !== next.account ||
    previous.organization !== next.organization ||
    previous.expiresAt !== next.expiresAt ||
    previous.installLog !== next.installLog
  );
}
