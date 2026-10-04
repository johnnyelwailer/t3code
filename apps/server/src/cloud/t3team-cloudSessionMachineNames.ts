/**
 * Pure naming rules for a cloud session that runs in a project machine (issue #562): the https
 * clone URL the session fetches, and the session workspace its conversations persist under.
 *
 * @module t3team-cloudSessionMachineNames
 */
import { parseRepositoryNameWithOwnerFromRemoteUrl } from "../git/GitManager.ts";

export interface MachineRepository {
  /** `https://<host>/<owner>/<repo>.git`, never carrying credentials. */
  readonly url: string;
  readonly host: string;
  readonly owner: string;
  readonly name: string;
}

const SEGMENT = /^[A-Za-z0-9._-]+$/;

/** The host of an https, ssh:// or scp-style (`git@host:owner/repo`) remote; null for others. */
const remoteHost = (remote: string): string | null => {
  if (/^(https|ssh):\/\//i.test(remote)) {
    const url = URL.parse(remote);
    // An explicit port names a server the session's https fetch would not reach.
    return url === null || url.port !== "" ? null : url.hostname;
  }
  return /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)/.exec(remote)?.[1] ?? null;
};

/**
 * The https form of a checkout's `origin` (credentials dropped). Null for anything else — a local
 * path, a nested group path, a `git://` remote: the session fetches over https with the user's
 * `gh` token, so only a `<host>/<owner>/<repo>` repository is reachable.
 */
export function machineRepositoryFromRemote(remote: string): MachineRepository | null {
  const host = remoteHost(remote.trim());
  const nameWithOwner = parseRepositoryNameWithOwnerFromRemoteUrl(remote);
  if (host === null || nameWithOwner === null) return null;
  const segments = nameWithOwner.split("/");
  if (segments.length !== 2) return null;
  const [owner, name] = segments as [string, string];
  if (![host, owner, name].every((part) => SEGMENT.test(part) && part !== "." && part !== "..")) {
    return null;
  }
  return { url: `https://${host}/${owner}/${name}.git`, host, owner, name };
}

/** At most 64 characters of `[A-Za-z0-9._-]`, as the session workflow's `workspace` input requires. */
export function machineWorkspaceName(repository: MachineRepository): string {
  return `machine-${repository.owner}.${repository.name}`.slice(0, 64);
}
