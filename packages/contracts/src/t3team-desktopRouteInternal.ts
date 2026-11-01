import type { DesktopRouteProposal } from "./t3team-desktopRoute.ts";

/** Names that only resolve inside a network or are reserved: no public name ends this way. */
const PRIVATE_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".lan",
  ".corp",
  ".home",
  ".intranet",
  ".localdomain",
  ".private",
  ".svc",
  ".test",
  ".invalid",
  ".example",
  ".arpa",
];

const hostOf = (target: string): string => {
  const noScheme = target.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const authority = noScheme.split(/[/?#]/)[0] ?? "";
  const bracketed = /^\[([^\]]*)\]/.exec(authority);
  const [name = "", port] = authority.split(":");
  const host =
    bracketed?.[1] ?? (port !== undefined && authority.split(":").length === 2 ? name : authority);
  return host.toLowerCase().replace(/\.$/, "");
};

const isNumericLabel = (label: string) => /^(0x[0-9a-f]*|\d+)$/.test(label);

/** [a, b, c] for a clean dotted-decimal IPv4 (no leading zeros, no octal or hex forms), else null. */
const dottedQuad = (labels: ReadonlyArray<string>): ReadonlyArray<number> | null =>
  labels.length === 4 && labels.every((l) => /^(0|[1-9]\d{0,2})$/.test(l) && Number(l) <= 255)
    ? labels.map(Number)
    : null;

function privateIpv4([a = 0, b = 0, c = 0]: ReadonlyArray<number>): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * True unless the target looks public: any non-clean-decimal IP form, an IPv6 literal, a private,
 * reserved or documentation IPv4, a network-only name, or anything not plain ASCII host syntax.
 * It only adds caution: a plain name may still resolve privately, which this never clears.
 */
export function looksInternalDesktopRouteTarget(target: string): boolean {
  // The desktop accepts a range down to /24 (IPv4) or /112 (IPv6); only a single host is public here.
  const range = /^([^/]+)\/(\d{1,3})$/.exec(target);
  if (range !== null && !/^(32|128)$/.test(range[2] ?? "")) return true;
  const host = hostOf(range?.[1] ?? target);
  if (host === "" || host === "localhost") return true;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) return true;
  const labels = host.split(".");
  const quad = dottedQuad(labels);
  if (quad !== null) return privateIpv4(quad);
  if (labels.some(isNumericLabel)) return true;
  return labels.length === 1 || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Internal for every decision the card and the grant make: the agent says so, or the address does.
 * The agent's flag alone is never trusted to clear it.
 */
export const isInternalDesktopRouteProposal = (proposal: DesktopRouteProposal): boolean =>
  proposal.internal || looksInternalDesktopRouteTarget(proposal.target);
