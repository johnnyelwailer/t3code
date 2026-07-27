/**
 * Pure helpers for the "install this CLI, then chain into sign-in" journey
 * driven by `ToolAuthService.install()`. Kept separate from the service
 * itself so the string/phase logic is trivial to unit test without a pty —
 * mirrors why `advance.ts` is its own module.
 *
 * @module toolauth/installFlow
 */
import type { AuthState, ToolAuthPhase } from "./types.ts";

/** Caps the rolling `installLog` so a chatty installer can't grow unbounded. */
export const MAX_INSTALL_LOG_CHARS = 8_000;

/** Appends `chunk` to `current` (if any), truncating from the front once over the cap. */
export function appendInstallLog(current: string | undefined, chunk: string): string {
  const combined = `${current ?? ""}${chunk}`;
  return combined.length > MAX_INSTALL_LOG_CHARS
    ? combined.slice(combined.length - MAX_INSTALL_LOG_CHARS)
    : combined;
}

/**
 * The package manager's own error text, pulled from the tail of its output —
 * npm/brew print human-readable failures at the end, not the start (unlike
 * `advance.ts`'s `firstLine`, which reads a CLI's prompt from the front).
 * Falls back to `undefined` when there is nothing usable to show.
 */
export function extractInstallErrorMessage(log: string | undefined): string | undefined {
  if (!log) return undefined;
  const lines = log
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return undefined;
  // Prefer the installer's own *error* lines over a blind tail window. npm
  // interleaves `warn` lines with the real failure, so "the last three lines"
  // reliably drags a deprecation warning into the message the user reads —
  // which is noise at best and misleading at worst. Fall back to the tail only
  // when nothing looks like an error, so an installer we haven't seen still
  // shows something rather than nothing.
  const errorLines = lines.filter((line) => INSTALL_ERROR_LINE.test(line));
  const chosen = errorLines.length > 0 ? errorLines : lines;
  return chosen.slice(-3).join("\n").slice(0, 500);
}

/**
 * Matches how the package managers we actually spawn mark failures: npm's
 * `npm ERR!` prefix, and the `error:`/`Error:`/`fatal` wording brew and most
 * others use. Deliberately does NOT match `warn`.
 */
const INSTALL_ERROR_LINE = /ERR!|\berror\b\s*:|^error\b|\bfatal\b/i;

/**
 * Phases where a real login pty is already spawned and running — `start()`
 * must not respawn over these. Deliberately excludes `installing`: a session
 * sitting in `installing` has no login pty yet, so the install-completion
 * handler chaining into the real spawn must NOT be treated as "already
 * active" and short-circuited.
 */
export function isActiveLoginPhase(phase: ToolAuthPhase): boolean {
  return (
    phase === "starting" ||
    phase === "awaiting-open" ||
    phase === "awaiting-code" ||
    phase === "verifying"
  );
}

/** No flow (of either kind) is currently running for this session. */
export function isTerminalPhase(phase: ToolAuthPhase): boolean {
  return phase === "connected" || phase === "failed" || phase === "expired";
}

/**
 * The terminal state for an install that hung. Stored on the session (not just
 * broadcast) so a client polling after the timeout reads `failed` rather than
 * falling back to a fresh probe that reports "not connected" — while staying
 * terminal per `isTerminalPhase`, so it never blocks a retry.
 */
export function timedOutInstallState(tool: string, formattedTimeout: string): AuthState {
  return {
    tool,
    phase: "failed",
    message: `Install timed out after ${formattedTimeout}.`,
  };
}
