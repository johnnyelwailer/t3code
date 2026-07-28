/**
 * Contracts for signing CLI tools (`claude`, `codex`) into a hosted sandbox
 * from the web UI — no terminal, no `claude auth login`, no pasting into a
 * shell.
 *
 * We never reimplement anyone's OAuth: no client_id, no token minting, no
 * credential passing through our code. The server spawns the genuine CLI in
 * a pty, scrapes its prompts, and renders them as UI; the CLI writes its own
 * credential store. See `apps/server/src/toolauth/` for the driving logic.
 */
import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/** The CLIs this surface can sign in. */
export const ToolAuthToolId = Schema.Literals(["claude", "codex"]);
export type ToolAuthToolId = typeof ToolAuthToolId.Type;

export const ToolAuthPhase = Schema.Literals([
  "idle", // never started, and no existing credential
  // The CLI binary itself is missing. `toolAuth.install` drives this phase,
  // then — on a successful re-probe — chains straight into `starting` below
  // with no separate request from the client: one click installs AND signs
  // in, rather than stopping at "installed" and making the human find a
  // second button. See `installLog` on `ToolAuthState`.
  "installing",
  "starting", // process spawned, no URL yet
  "awaiting-open", // URL available, waiting for the human to visit it
  "awaiting-code", // the human must paste a code back (Claude; no device flow)
  "verifying", // input submitted, CLI is checking
  "connected",
  "failed",
  "expired", // credential exists but is no longer valid
]);
export type ToolAuthPhase = typeof ToolAuthPhase.Type;

/** What the UI needs to render for one tool's card, and nothing more. */
export const ToolAuthState = Schema.Struct({
  tool: ToolAuthToolId,
  phase: ToolAuthPhase,
  /** Present from `awaiting-open` onward. */
  url: Schema.optional(Schema.String),
  /**
   * A device code to *display* (the human types it into the web page).
   * Distinct from `awaiting-code`, where the human brings a code back to us.
   */
  displayCode: Schema.optional(Schema.String),
  /** The CLI's own message — used verbatim for `failed`, and for expiry hints. */
  message: Schema.optional(Schema.String),
  /**
   * Account identifier (email, username, ...), when the CLI reports one.
   * Never a stand-in for `authMethod`/`apiProvider`-shaped fields — those
   * describe *how* the tool is authenticated, not *who* is signed in, and
   * must not be presented as an account.
   */
  account: Schema.optional(Schema.String),
  /** Organisation/workspace label, when the CLI reports one — independent of `account`. */
  organization: Schema.optional(Schema.String),
  /** Epoch milliseconds. Only present when the tool's credential store reports it. */
  expiresAt: Schema.optional(Schema.Number),
  /**
   * Rolling, ANSI-stripped output from the package manager. Only meaningful
   * during `installing` — a progress log for the one-click install, not a
   * stand-in for `message` (which stays the CLI's/package manager's own
   * verbatim text for `failed`).
   */
  installLog: Schema.optional(Schema.String),
});
export type ToolAuthState = typeof ToolAuthState.Type;

export const ToolAuthListInput = Schema.Struct({});
export type ToolAuthListInput = typeof ToolAuthListInput.Type;

export const ToolAuthListResult = Schema.Struct({
  tools: Schema.Array(ToolAuthState),
});
export type ToolAuthListResult = typeof ToolAuthListResult.Type;

export const ToolAuthStartInput = Schema.Struct({
  tool: ToolAuthToolId,
});
export type ToolAuthStartInput = typeof ToolAuthStartInput.Type;

export const ToolAuthSubmitCodeInput = Schema.Struct({
  tool: ToolAuthToolId,
  code: TrimmedNonEmptyString,
});
export type ToolAuthSubmitCodeInput = typeof ToolAuthSubmitCodeInput.Type;

export const ToolAuthCancelInput = Schema.Struct({
  tool: ToolAuthToolId,
});
export type ToolAuthCancelInput = typeof ToolAuthCancelInput.Type;

// NOTE: these error classes deliberately use a plain `Schema.String` for
// `tool`, not `ToolAuthToolId` — the server-internal `ToolAuthService` also
// drives a `fake` test/dev adapter (see `apps/server/src/toolauth/adapters.ts`)
// that never reaches the wire, and these errors can describe it too. Payload
// schemas below (`ToolAuthStartInput` and friends) still restrict `tool` to
// `ToolAuthToolId`, so a real client can only ever request `claude | codex`.
export class ToolAuthSpawnError extends Schema.TaggedErrorClass<ToolAuthSpawnError>()(
  "ToolAuthSpawnError",
  {
    tool: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Failed to start the sign-in flow for ${this.tool}.`;
  }
}

export class ToolAuthNotAwaitingCodeError extends Schema.TaggedErrorClass<ToolAuthNotAwaitingCodeError>()(
  "ToolAuthNotAwaitingCodeError",
  {
    tool: Schema.String,
    phase: ToolAuthPhase,
  },
) {
  override get message(): string {
    return `${this.tool} is not awaiting a code (current phase: ${this.phase}).`;
  }
}

export class ToolAuthNoActiveSessionError extends Schema.TaggedErrorClass<ToolAuthNoActiveSessionError>()(
  "ToolAuthNoActiveSessionError",
  {
    tool: Schema.String,
  },
) {
  override get message(): string {
    return `No active sign-in session for ${this.tool}.`;
  }
}

export const ToolAuthError = Schema.Union([
  ToolAuthSpawnError,
  ToolAuthNotAwaitingCodeError,
  ToolAuthNoActiveSessionError,
]);
export type ToolAuthError = typeof ToolAuthError.Type;

const ToolAuthStreamSnapshotEvent = Schema.Struct({
  type: Schema.Literal("snapshot"),
  tools: Schema.Array(ToolAuthState),
});

const ToolAuthStreamUpdateEvent = Schema.Struct({
  type: Schema.Literal("update"),
  state: ToolAuthState,
});

export const ToolAuthStreamEvent = Schema.Union([
  ToolAuthStreamSnapshotEvent,
  ToolAuthStreamUpdateEvent,
]);
export type ToolAuthStreamEvent = typeof ToolAuthStreamEvent.Type;

/**
 * One-click "install this CLI" — a sibling capability to the sign-in flow
 * above, deliberately NOT a parallel state machine: `toolAuth.install`
 * returns the same `ToolAuthState` shape as `toolAuth.start` (an immediate
 * `installing` snapshot), and every subsequent beat of the journey —
 * `installing` → (re-probe) → `starting` → `awaiting-open`/`awaiting-code` →
 * `connected`/`failed` — streams through the EXISTING `subscribeToolAuth`
 * subscription the client already has open. There is no second stream to
 * wire up and no "installed, now click connect" dead end: the server chains
 * straight from a successful install into the real login flow.
 *
 * The server maps `tool` to a STATIC package name (see
 * `apps/server/src/toolauth/t3team-installPackages.ts`'s `TOOL_INSTALL_PACKAGES`) and
 * spawns a package manager through the same `PtyAdapter` the sign-in flow
 * uses. The client never sends a command, package name, or flag — only this
 * closed `ToolAuthToolId`.
 */
export const ToolAuthInstallInput = Schema.Struct({
  tool: ToolAuthToolId,
});
export type ToolAuthInstallInput = typeof ToolAuthInstallInput.Type;
