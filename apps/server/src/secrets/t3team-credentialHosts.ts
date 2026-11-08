/**
 * The forge whose sign-in answers a request for a host: a registry host (npm.pkg.github.com, ghcr.io,
 * npm.<org>.ghe.com) maps to its forge. Only GitHub.com, GHE.com and the host `gh` is configured for
 * (`GH_HOST`) count, so a request can never make the server present its credential to another host.
 */
export function forgeHostFor(host: string, ghHost: string | undefined): string | undefined {
  const lower = host.toLowerCase();
  if (lower === "github.com" || lower.endsWith(".github.com") || lower === "ghcr.io") {
    return "github.com";
  }
  if (lower.endsWith(".ghe.com")) return lower.split(".").slice(-3).join(".");
  return ghHost !== undefined && lower === ghHost.toLowerCase() ? lower : undefined;
}
