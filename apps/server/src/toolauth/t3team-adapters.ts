/**
 * Tool definitions. Adding a tool is a table entry — no new code path.
 *
 * The two flows differ in one important way, and the UI must reflect it:
 *
 *   Codex  — RFC-8628 device flow. We DISPLAY a code; the human types it into
 *            the web page. Nothing comes back to us. Cleanest possible UX.
 *   Claude — no device flow (upstream issue #22992). The browser shows a code
 *            the human must bring BACK. So the UI needs one input field.
 *
 * That asymmetry is exactly why this is an adapter interface rather than one
 * hardcoded flow.
 *
 * Ported from `prototypes/hosted-sandbox/lib/toolauth/adapters.ts`, kept in
 * sync with its verification notes (checked read-only against the real CLIs
 * on this machine — Claude Code 2.1.220, codex-cli 0.145.0 — without
 * triggering OAuth):
 *   - VERIFIED: `command` and `status.probe` for both tools.
 *   - UNVERIFIED (best-guess): every `match` pattern, and Claude's
 *     `status.account`/`organization`/`credentialExpiryPath` (the logged-out
 *     JSON has no such fields to confirm against).
 *
 * @module toolauth/adapters
 */
import type { ToolAuthAdapter, ToolAuthPhase } from "./t3team-types.ts";

export const CLAUDE: ToolAuthAdapter = {
  tool: "claude",
  label: "Claude Code",
  description: "Sign in with your Claude account to use Claude Code in this sandbox.",
  // VERIFIED: `claude auth` is a real subcommand group (login/logout/status).
  // Bare `claude`, or `claude /status`, both open the interactive REPL instead
  // — the latter treats "/status" as a *prompt*, not a slash command, since
  // slash commands only exist inside the REPL. Either would hang a broker
  // session and burn tokens, so this must stay a real `auth` subcommand.
  command: ["claude", "auth", "login"],
  needsTty: true,
  match: {
    // UNVERIFIED — a guess from documentation.
    url: /(https:\/\/(?:claude\.ai|console\.anthropic\.com)\/[^\s"']+)/i,
    // "Paste code here if prompted" — the fallback whenever the browser cannot
    // reach the CLI's localhost callback, which is always true for a remote sandbox.
    awaitingCode: /paste code here|enter the code|authorization code/i,
    success: /login successful|logged in as|already authenticated/i,
    // `expired` is qualified rather than bare: on its own it also fires on
    // incidental prose like "Login successful; expired credentials removed",
    // which is a SUCCESS line. Success is matched first now, but a matcher this
    // loose would still mislabel any failure-free line that mentions expiry.
    failure:
      /authentication failed|login failed|invalid code|(?:code|token|session|link) (?:has )?expired/i,
  },
  status: {
    // A HINT, not authoritative (see `ToolAuthStatusConfig.credentialPath`):
    // on this macOS machine, Claude Code keeps its credential in the Keychain
    // instead (`security find-generic-password -s "Claude Code-credentials"`)
    // — this path is believed correct for the Linux container deployment
    // target, and is only consulted when `probe` is absent or fails to run.
    credentialPath: ".claude/.credentials.json",
    // VERIFIED: `claude auth status --json` is a real, non-interactive
    // command; `--json` is in fact the default (`--text` asks for the
    // human-readable form). Real verbatim output on this machine
    // (ANTHROPIC_BASE_URL set, no Keychain session):
    //   {"loggedIn":false,"authMethod":"none","apiProvider":"firstParty"}
    probe: ["claude", "auth", "status", "--json"],
    parseProbe: (out: string): ToolAuthPhase => {
      try {
        const parsed = JSON.parse(out) as { loggedIn?: unknown };
        if (typeof parsed.loggedIn === "boolean") {
          // The authenticated JSON shape — and whether it ever distinguishes
          // "expired" from a plain "loggedIn:false" — is NOT verified; real
          // OAuth was out of bounds. Treat loggedIn:true as connected;
          // anything else falls through only if JSON parsing itself fails (a
          // genuinely different/older output shape).
          return parsed.loggedIn ? "connected" : "idle";
        }
      } catch {
        // Not JSON — fall through to the guess below rather than throwing.
      }
      // UNVERIFIED guess, kept only as a fallback for an output shape we have not seen.
      if (/expired\s*—\s*log in again|login expired/i.test(out)) return "expired";
      if (/login method|logged in|organization/i.test(out)) return "connected";
      return "idle";
    },
    // UNVERIFIED — the logged-out JSON has no account/organization fields to
    // confirm against; guessed key names for whatever the authenticated shape
    // turns out to be.
    account: /"account"\s*:\s*"([^"]+)"/,
    organization: /"organization"\s*:\s*"([^"]+)"/,
    // UNVERIFIED guess at the credential file's own shape (irrelevant on this
    // macOS machine, where the credential lives in the Keychain instead).
    credentialExpiryPath: "expiresAt",
    // VERIFIED live: with ANTHROPIC_BASE_URL set, `claude auth status --json`
    // reports loggedIn:false while the Claude provider is healthy and serving
    // models. Signing in would fix nothing, so don't ask.
    nonOAuthEnvVars: ["ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
  },
  // ~/.claude holds the credential, settings and history. CLAUDE_CONFIG_DIR can
  // relocate it if home is not on the volume.
  persistPaths: [".claude"],
};

export const CODEX: ToolAuthAdapter = {
  tool: "codex",
  label: "Codex",
  description: "Sign in with your ChatGPT account to use Codex in this sandbox.",
  // VERIFIED: device auth is real on 0.145.0. Plain `codex login` binds
  // localhost:1455, which a remote sandbox's browser cannot reach.
  command: ["codex", "login", "--device-auth"],
  needsTty: true,
  match: {
    url: /(https:\/\/(?:auth\.openai\.com|chatgpt\.com)\/[^\s"']+)/i,
    // Device flow: the code is DISPLAYED, never sent back to us.
    //
    // The leading `(?<![/\w-])` matters. Without it this also matches a code
    // embedded in a URL path — `https://auth.openai.com/device/ABCD-1234` — and
    // the UI would then present a fragment of the sign-in URL as the code to
    // type, on the very same line that carries the URL. Requiring the match not
    // to follow a slash keeps it to a standalone token.
    displayCode: /(?<![/\w-])([A-Z0-9]{4}-[A-Z0-9]{4})\b/,
    success: /successfully logged in|authentication complete|logged in as/i,
    failure: /device code (?:login )?(?:is )?(?:not enabled|disabled)|expired|denied/i,
  },
  status: {
    credentialPath: ".codex/auth.json",
    // VERIFIED: `codex login status` prints verbatim `Logged in using ChatGPT`
    // when authenticated on codex-cli 0.145.0.
    probe: ["codex", "login", "status"],
    parseProbe: (out: string): ToolAuthPhase => {
      if (/logged in using/i.test(out)) return "connected";
      // UNVERIFIED guess — not confirmed against a real signed-out CLI.
      if (/not logged in/i.test(out)) return "idle";
      return "idle";
    },
    // Deliberately NO `account` mapping. `codex login status` prints "Logged in
    // using ChatGPT" — verified live — and "ChatGPT" is the auth *method*, not
    // an account name. Capturing it here rendered "Signed in as ChatGPT" in the
    // UI, which is the same mislabeling we already removed once for Claude's
    // authMethod/apiProvider. The card degrades to a plain "Connected", which
    // is true; a real account would need output that actually names one.
    // Codex refreshes its own token silently; no expiry is surfaced here.
    nonOAuthEnvVars: ["OPENAI_API_KEY", "CODEX_ACCESS_TOKEN"],
  },
  persistPaths: [".codex"],
};

/**
 * A harmless stand-in with the same shape, so the state machine and service
 * can be tested without triggering anyone's real OAuth. Points at a fixture
 * script. Never exposed over the wire (see `PRODUCTION_TOOLS` below) —
 * internal test/dev use only.
 */
export const FAKE: ToolAuthAdapter = {
  tool: "fake",
  label: "Example tool",
  description: "Test fixture exercising the same three-beat flow.",
  command: ["node", new URL("./fixtures/t3team-fake-cli.mjs", import.meta.url).pathname],
  needsTty: false,
  match: {
    url: /(https:\/\/example\.invalid\/device\/[A-Za-z0-9]+)/,
    awaitingCode: /paste code here/i,
    success: /login successful/i,
    failure: /login failed/i,
  },
  status: { credentialPath: ".fake/credentials.json" },
  persistPaths: [".fake"],
};

export const ADAPTERS: Record<string, ToolAuthAdapter> = {
  [CLAUDE.tool]: CLAUDE,
  [CODEX.tool]: CODEX,
  [FAKE.tool]: FAKE,
};

/** The tools surfaced in the production API/UI — `fake` is test/dev only. */
export const PRODUCTION_TOOLS: ReadonlyArray<string> = [CLAUDE.tool, CODEX.tool];

export function getAdapter(tool: string): ToolAuthAdapter {
  const adapter = ADAPTERS[tool];
  if (!adapter) {
    throw new Error(`unknown tool '${tool}' (have: ${Object.keys(ADAPTERS).join(", ")})`);
  }
  return adapter;
}
