/**
 * Atlassian only redirects to callback URIs registered in the Developer Console, by exact port. A
 * desktop build pinned to another port than the registered ones would send the user to Atlassian's
 * own error page and then wait out the 15 minute sign-in TTL, so sign-in checks the port first.
 *
 * `__T3TEAM_ATLASSIAN_CALLBACK_PORTS__` is baked in by desktop builds that pin a backend port
 * (scripts/lib/t3team-isolatedInstanceEnv.ts); web, dev and self-hosted builds carry no list and
 * are never checked.
 */
import { ATLASSIAN_OAUTH_CALLBACK_PATH } from "./t3team-atlassianOAuthRedirect";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function readRegisteredAtlassianCallbackPorts(): readonly number[] | undefined {
  return typeof __T3TEAM_ATLASSIAN_CALLBACK_PORTS__ === "undefined"
    ? undefined
    : (__T3TEAM_ATLASSIAN_CALLBACK_PORTS__ ?? undefined);
}

/** An error message when `redirectUri` is a loopback callback on an unregistered port, else null. */
export function checkAtlassianCallbackRegistered(
  redirectUri: string,
  registeredPorts: readonly number[] | undefined,
): string | null {
  if (registeredPorts === undefined) return null;
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) return null;
  const port = Number(url.port || 80);
  if (registeredPorts.includes(port)) return null;
  const registered = registeredPorts.map(
    (entry) => `http://127.0.0.1:${entry}${ATLASSIAN_OAUTH_CALLBACK_PATH}`,
  );
  return (
    `Atlassian sign-in cannot work in this app yet: it listens on port ${port}, and ` +
    `http://127.0.0.1:${port}${ATLASSIAN_OAUTH_CALLBACK_PATH} is not registered as a callback URL ` +
    `in the Atlassian Developer Console (registered: ${registered.join(", ")}). ` +
    `Ask an administrator to add that URL to the OAuth app, or use the installed Nexi Work for Jira.`
  );
}
