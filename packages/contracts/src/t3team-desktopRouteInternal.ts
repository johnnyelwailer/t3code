import type { DesktopRouteProposal } from "./t3team-desktopRoute.ts";

/** Names that only resolve inside a network; no public name ends this way. */
const PRIVATE_SUFFIXES = [
  ".local",
  ".internal",
  ".lan",
  ".corp",
  ".home",
  ".intranet",
  ".localdomain",
  ".private",
];

const hostOf = (target: string): string => {
  const noScheme = target.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const authority = noScheme.split(/[/?#]/)[0] ?? "";
  const bracketed = /^\[([^\]]*)\]/.exec(authority);
  const host =
    bracketed?.[1] ??
    (authority.includes(":") && authority.split(":").length === 2
      ? (authority.split(":")[0] ?? "")
      : authority);
  return host.toLowerCase().replace(/\.$/, "").split("/")[0] ?? "";
};

const ipv4Octets = (host: string): ReadonlyArray<number> | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m === null) return null;
  const octets = m.slice(1).map(Number);
  return octets.every((n) => n <= 255) ? octets : null;
};

function privateIpv4([a = 0, b = 0]: ReadonlyArray<number>): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * Whether the target is NOT a public-looking address: a private, loopback, link-local or reserved
 * IP literal, a name that only resolves inside a network, or anything this cannot read as a host.
 * It only ever adds caution: a plain name can still resolve privately, which is what the agent's
 * own `internal` flag says, and which this never clears.
 */
export function looksInternalDesktopRouteTarget(target: string): boolean {
  const host = hostOf(target);
  if (host === "" || host === "localhost") return true;
  const v4 = ipv4Octets(host);
  if (v4 !== null) return privateIpv4(v4);
  if (host.includes(":")) return true; // IPv6 literals are not classified: treated as internal
  if (/^[\d.]+$/.test(host)) return true; // a malformed or short-form numeric host
  return !host.includes(".") || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Internal for every decision the card and the grant make: the agent says so, or the address does.
 * The agent's flag alone is never trusted to clear it.
 */
export const isInternalDesktopRouteProposal = (proposal: DesktopRouteProposal): boolean =>
  proposal.internal || looksInternalDesktopRouteTarget(proposal.target);
