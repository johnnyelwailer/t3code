/**
 * Fork graft for `recognizeRemote` in `definition.ts`: the Nexplore GitHub Enterprise hosts.
 *
 * Upstream recognises `github.com`, `*.ghe.com` and any host carrying a `github` label. The fork
 * also treats `*.ghe.localhost` (local GitHub Enterprise test hosts) and a bare `ghe` label
 * (`ghe.acme.internal`) as GitHub. The bare `ghe.com` is GitHub's own marketing domain, not an
 * enterprise's subdomain, so it stays unclaimed.
 */
export function isGitHubEnterpriseFork(hostname: string): boolean {
  if (hostname === "ghe.com") return false;
  return hostname.endsWith(".ghe.localhost") || hostname.split(".").includes("ghe");
}
