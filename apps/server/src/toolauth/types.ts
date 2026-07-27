/**
 * Terminal-less authentication for CLIs that live inside a hosted sandbox.
 *
 * The deliberate non-goal: we do NOT reimplement anyone's OAuth. We never hold
 * a client_id, never mint a token, never see a credential. The genuine CLI
 * performs its own flow and writes its own credential store — the server only
 * drives it (through the existing `PtyAdapter` service, see
 * `ToolAuthService.ts`) and renders its prompts as UI.
 *
 * Every flow we care about is the same three beats:
 *   1. the CLI emits a URL
 *   2. the human approves it in a browser
 *   3. either the CLI completes on its own (device flow), or it wants a code
 *      back
 *
 * So a tool is a set of matchers over that state machine, not an integration.
 *
 * Ported from `prototypes/hosted-sandbox/lib/toolauth/{types,adapters,session}.ts`
 * — `PtyAdapter`/`ProcessRunner` fill the role the prototype's own pty/process
 * wrapper played, and `advance()` is carried over with unchanged behaviour.
 *
 * @module toolauth/types
 */
import type { ToolAuthPhase } from "@t3tools/contracts";

export type { ToolAuthPhase };

/**
 * Server-internal phase/tool state. Broader than the wire `ToolAuthState`
 * schema (`tool` is a plain string, not restricted to `claude | codex`) so the
 * `fake` test adapter can flow through the exact same service and state
 * machine as the real tools; the ws.ts handlers narrow to the wire type at
 * the RPC boundary.
 */
export interface AuthState {
  tool: string;
  phase: ToolAuthPhase;
  /** Present from `awaiting-open` onward. */
  url?: string | undefined;
  /**
   * A device code to *display* (the human types it into the web page).
   * Distinct from `awaiting-code`, where the human brings a code back to us.
   */
  displayCode?: string | undefined;
  message?: string | undefined;
  /**
   * Account identifier, when the CLI (or its probe) reports one. Never a
   * stand-in for `authMethod`/`apiProvider`-shaped fields — those describe
   * *how* the tool is authenticated, not *who* is signed in.
   */
  account?: string | undefined;
  /** Organisation/workspace label, when the CLI reports one — independent of `account`. */
  organization?: string | undefined;
  /** Epoch milliseconds. Only set when the credential store reports one. */
  expiresAt?: number | undefined;
  /**
   * Rolling, ANSI-stripped output from the package manager. Only meaningful
   * during `installing` — set by `ToolAuthService.install()` (see
   * `installFlow.ts`) and mirrored on the wire `ToolAuthState` in
   * `@t3tools/contracts`.
   */
  installLog?: string | undefined;
}

export interface ToolAuthStatusConfig {
  /**
   * Credential file whose presence implies a session, relative to home.
   *
   * A HINT, not authoritative: on macOS, Claude Code keeps its credential in
   * the Keychain rather than this path (verified against claude 2.1.220 — the
   * file simply does not exist there), so a missing file must never be read
   * as "not connected" when a `probe` is declared and actually runs. It's
   * believed correct for the Linux container that is the real deployment
   * target, which is why it stays — used only when `probe` is absent or
   * fails to run.
   */
  credentialPath: string;
  /**
   * Argv for a non-interactive status check. Must be run with the same
   * environment the interactive login would use (`ANTHROPIC_BASE_URL` and
   * friends change what a probe reports) — the caller supplies that env, and
   * tests can override it.
   */
  probe?: string[];
  /** Parses the probe's stdout into a phase. */
  parseProbe?: (stdout: string) => ToolAuthPhase;
  /**
   * Regex over the probe's stdout (or the raw credential file text, when no
   * probe ran) that captures an account label to show in the UI. Group 1 is
   * the value.
   */
  account?: RegExp;
  /** Same idea as `account`, for an organization/workspace label. */
  organization?: RegExp;
  /**
   * Dot-path into the parsed credential-file JSON where an expiry timestamp
   * lives (epoch seconds, epoch ms, or an ISO string — `status.ts` normalizes
   * all three), for tools that report one at all. Reads for expiry metadata
   * ONLY — every other field (access tokens, refresh tokens, ...) is never
   * inspected or returned.
   */
  credentialExpiryPath?: string;
}

export interface ToolAuthAdapter {
  /** Stable id used in the API and the UI. */
  readonly tool: string;
  readonly label: string;
  /** One line explaining what signing in here grants. */
  readonly description: string;

  /** Argv for the interactive login. */
  readonly command: string[];

  /**
   * Most CLIs detect a non-TTY and change behaviour or refuse outright.
   * Retained from the prototype as adapter metadata; the server always
   * spawns through the real `PtyAdapter` service regardless (that is the
   * whole point of running inside `apps/server`), so this no longer gates
   * whether we spawn — it only documents the requirement.
   */
  readonly needsTty: boolean;

  /**
   * Matchers over the CLI's output. Deliberately data, not code: a new tool
   * is a table entry, and the matchers are testable without spawning
   * anything.
   *
   * UNVERIFIED: these patterns are a best-effort guess (from documentation,
   * not a real run) — confirming them needs a real interactive login, which
   * is out of bounds for this task.
   */
  readonly match: {
    /** Captures the sign-in URL. Group 1 must be the URL. */
    url: RegExp;
    /** The CLI is waiting for a code we must send back. */
    awaitingCode?: RegExp;
    /** A code to show the user (device flow). Group 1 must be the code. */
    displayCode?: RegExp;
    success: RegExp;
    failure?: RegExp;
  };

  /** How to answer "is this tool already connected?" without starting a flow. */
  readonly status: ToolAuthStatusConfig;

  /** Paths that must persist on the user's volume for the session to survive. */
  readonly persistPaths: string[];
}
