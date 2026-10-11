/**
 * The "blind baseline" half of the viewer source's flood guard (see
 * t3team-workflowSignalScmViewerDiff.ts): which hosts a poll may not trust yet, and when one
 * stops being untrusted.
 *
 * A host is blind when it failed, was cut off by the search limit, dropped out of gh's signed-in
 * list (logout), or gh could not list hosts at all (`"*"`). Blind hosts keep their cursor entries
 * untouched. A baseline taken while a host was blind stays `pending` for it — silent, learning
 * only — and settles on either of:
 *   • one complete read of the host; or
 *   • for a host that answers but is over the limit (`truncatedHosts`), the same set of change
 *     requests on two consecutive polls. A failing host never settles this way: an empty read
 *     twice over says nothing. Past the limit a PR can only surface by displacing another, so a
 *     settled over-limit host emits at most the PRs that genuinely arrive afterwards.
 */

import type { ViewerPrRead } from "./t3team-myworkViewerPrLoader.ts";

interface PendingState {
  readonly pending?: ReadonlyArray<string> | undefined;
  /** Over-limit hosts' read signatures from the previous poll, to see the read hold still. */
  readonly stable?: Readonly<Record<string, string>> | undefined;
}

/** Whether `host` is still being baselined, so this poll learns its PRs but emits nothing. */
export const isSilent = (prev: PendingState | null, host: string): boolean =>
  prev === null || (prev.pending ?? []).some((h) => h === "*" || h === host);

/** Hosts this poll cannot trust to say a missing change request is gone. */
export function blindHostsOf(read: ViewerPrRead): (host: string) => boolean {
  const incomplete = new Set(read.incompleteHosts);
  const signedIn = new Set(read.signedInHosts);
  return (host) => incomplete.has("*") || incomplete.has(host) || !signedIn.has(host);
}

/** FNV-1a over the sorted keys: cheap, and only ever compared with itself a poll later. */
function signature(keys: ReadonlyArray<string>): string {
  let hash = 0x811c9dc5;
  for (const char of keys.toSorted().join("\n")) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  }
  return `${keys.length}:${hash.toString(16)}`;
}

/** The pending hosts (and stability signatures) the next cursor carries. */
export function nextPending(
  prev: PendingState | null,
  read: ViewerPrRead,
): { readonly pending?: string[]; readonly stable?: Record<string, string> } {
  const blind = blindHostsOf(read);
  const truncated = new Set(read.truncatedHosts);
  const sigOf = (host: string) =>
    signature(
      read.entries.filter((e) => e.host === host).map((e) => `${e.repository}#${e.number}`),
    );
  const was = prev?.pending ?? [];
  const candidates =
    prev === null || was.includes("*") ? read.incompleteHosts : was.filter((h) => blind(h));
  const pending = candidates.filter(
    (host) => !(prev !== null && truncated.has(host) && prev.stable?.[host] === sigOf(host)),
  );
  const stable = Object.fromEntries(
    pending.filter((host) => truncated.has(host)).map((host) => [host, sigOf(host)]),
  );
  return {
    ...(pending.length > 0 ? { pending } : {}),
    ...(Object.keys(stable).length > 0 ? { stable } : {}),
  };
}
