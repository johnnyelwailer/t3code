/**
 * The gh (GHE) tool-auth adapter. The device flow is performed by the gh CLI
 * itself against the company GHE instance (default `nexplore.ghe.com`) — we
 * only drive its pty and read its output, same posture as the other adapters
 * in `t3team-adapters.ts`: no client_id, no token handling, nothing to mint.
 *
 * gh additionally waits for an Enter after printing the one-time code before
 * it starts polling — a headless sandbox answers that automatically
 * (`match.autoEnter`, answered in `t3team-loginProcessWiring.ts`).
 *
 * @module toolauth/ghAdapter
 */
import type { ToolAuthAdapter, ToolAuthPhase } from "./t3team-types.ts";

/**
 * The GHE host gh signs in against. A hosted sandbox's git work targets the
 * company instance, not github.com, so the panel signs in THERE. Overridable
 * per deployment via `T3TEAM_GH_LOGIN_HOSTNAME` (read once at module load,
 * like the Atlassian OAuth client-id keys).
 */
export const GH_LOGIN_HOSTNAME_ENV = "T3TEAM_GH_LOGIN_HOSTNAME";
export const GH_DEFAULT_LOGIN_HOSTNAME = "nexplore.ghe.com";

/** Escape a hostname for interpolation into the matcher regexes below. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The gh adapter as a factory so tests can point the matchers at any host
 * without touching the module-level instance.
 */
export function ghAdapter(hostname: string): ToolAuthAdapter {
  const host = escapeRegex(hostname);
  return {
    tool: "gh",
    label: "GitHub",
    description: `Log in to your ${hostname} account so git work in this sandbox uses your own identity.`,
    // VERIFIED against gh 2.96.0 on nexplore.ghe.com (captured live in an
    // 80x30 pty): `--hostname` + `--web` skip the host and auth-method
    // prompts, `--git-protocol` skips the per-host protocol question —
    // without it the flow first stops on
    // "What is your preferred protocol for Git operations on this host?".
    // gh then performs the device flow itself and writes its own credential
    // store; nothing in this flow touches a token.
    command: ["gh", "auth", "login", "--hostname", hostname, "--web", "--git-protocol", "https"],
    needsTty: true,
    // VERIFIED against gh 2.96.0: `GH_BROWSER` is gh's documented launcher
    // override ("the web browser to use for opening links"); a probe with a
    // logger script confirmed the Enter makes gh invoke it with the device
    // URL. Pointing it at `true` keeps the auto-answered Enter from popping
    // the host's browser open before the user has copied the code off the
    // card (and does nothing on a headless VM, where it would be useless
    // anyway) — while still starting gh's device-code polling. The device
    // URL is on the card; the user opens it on their own schedule.
    // (GH_NO_BROWSER is NOT a gh variable — verified absent from the binary.)
    spawnEnv: { GH_BROWSER: "/usr/bin/true" },
    match: {
      // VERIFIED: gh prints "Press Enter to open https://nexplore.ghe.com/login/device
      // in your browser..." — the URL ends at the next space.
      url: new RegExp(`(https://${host}/login/device)`),
      // VERIFIED: "! First copy your one-time code: B4A0-AA8E" — a standalone
      // 4-4 uppercase token. The lookbehind keeps a code embedded in a URL path
      // out, same trap as Codex's matcher.
      displayCode: /(?<![/\w-])([A-Z0-9]{4}-[A-Z0-9]{4})\b/,
      // VERIFIED: the line that follows the code. gh blocks here until Enter,
      // which is what starts its own polling — the pty layer auto-answers it
      // (see `autoEnter` on `ToolAuthAdapter.match`).
      autoEnter: /press enter to open/i,
      // VERIFIED strings from the gh 2.96.0 binary: "✓ Authentication
      // complete." and "✓ Logged in to nexplore.ghe.com account <login>
      // (<storage>)".
      success: new RegExp(`authentication complete|logged in to ${host}`, "i"),
      // VERIFIED strings: "✗ Failed to log in to <host> ..." and "✗ Timeout
      // trying to log in to <host> using token ..." (the device-code expiry).
      failure: new RegExp(`failed to log in|timeout trying to log in`, "i"),
    },
    status: {
      // gh keeps host tokens in ~/.config/gh/hosts.yml when no keyring is
      // available (the GHA-VM case). A HINT only, like every other tool's
      // credentialPath — the probe decides.
      credentialPath: ".config/gh/hosts.yml",
      // VERIFIED: `gh auth status` is non-interactive and prints, per host,
      // "✓ Logged in to nexplore.ghe.com account <login> (<storage>)".
      // Logged in to OTHER hosts (github.com) must not count: match the
      // configured host specifically.
      probe: ["gh", "auth", "status"],
      parseProbe: (out: string): ToolAuthPhase =>
        new RegExp(`logged in to ${host}`, "i").test(out) ? "connected" : "idle",
      // Both wordings exist across gh versions ("as <login>" in older ones,
      // "account <login>" in current) — the capture above is the current one.
      account: new RegExp(`Logged in to ${host} (?:as|account) (\\S+)`),
    },
    persistPaths: [".config/gh"],
  };
}

const ghLoginHostname = process.env[GH_LOGIN_HOSTNAME_ENV]?.trim() || GH_DEFAULT_LOGIN_HOSTNAME;
export const GH: ToolAuthAdapter = ghAdapter(ghLoginHostname);
