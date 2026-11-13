import { isGitHubEnterpriseFork } from "./t3team-githubEnterpriseHost.ts";

/**
 * Fork graft for `gitHubMediaUrl`. A client cannot know which hosts the server holds a credential
 * for, so media on any enterprise-shaped host goes to the server, which fetches it only with a
 * credential configured for that host.
 */
export function isGitHubEnterpriseMediaHost(host: string): boolean {
  return (host.endsWith(".ghe.com") && host !== "ghe.com") || isGitHubEnterpriseFork(host);
}

/** An enterprise serves file bytes from `raw.<host>`, which honours the host's token. */
export function enterpriseRawHost(
  host: string,
  isEnterpriseHost: (host: string) => boolean,
): string | null {
  return isEnterpriseHost(host) ? `raw.${host}` : null;
}

/** The enterprise web host whose files `host` serves, when `host` is a `raw.` file host. */
export function enterpriseHostOfRaw(
  host: string,
  isEnterpriseHost: (host: string) => boolean,
): string | null {
  const web = host.startsWith("raw.") ? host.slice("raw.".length) : null;
  return web !== null && isEnterpriseHost(web) ? web : null;
}
