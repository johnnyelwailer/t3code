/**
 * Pure naming rules for cloud sessions: the https clone URL a project machine fetches (issue
 * #562), and the per-user workspace a session's conversations persist under.
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

/** The commit identity for the user's work in the machine, from their `gh api user` profile. */
export interface MachineGitAuthor {
  readonly name: string;
  readonly email: string;
}

/**
 * Name and email as the forge shows them; a private email falls back to the forge's noreply
 * address (`<id>+<login>@users.noreply.<host>`), which it attributes to the same account.
 */
export function machineGitAuthor(
  profile: {
    readonly login: string;
    readonly id: number;
    readonly name?: string | null | undefined;
    readonly email?: string | null | undefined;
  },
  host: string,
): MachineGitAuthor {
  const name = profile.name?.trim() || profile.login;
  const email = profile.email?.trim() || `${profile.id}+${profile.login}@users.noreply.${host}`;
  return { name, email };
}

/** At most 64 characters of `[A-Za-z0-9._-]`, as the session workflow's `workspace` input requires. */
const WORKSPACE_LIMIT = 64;
/** `_` is reserved as the terminator, so a segment never contains it. */
const workspaceSegment = (value: string) => value.replace(/[^A-Za-z0-9.-]/g, "-");

/** FNV-1a, as 8 hex digits: keeps two long names that share a prefix apart once truncated. */
const shortHash = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/**
 * The workspace a session's conversations persist under (the session workflow's snapshot key).
 * Always the creator's own: the snapshot holds their threads and the environment's keypair, and
 * the fleet's cache is shared by everyone who dispatches sessions there. `u-<login>` for a plain
 * session, `m-<login>.<owner>.<repo>` for one in a project machine; at most 64 characters of
 * `[A-Za-z0-9._-]`, the workflow's rule.
 *
 * Every name ends in `_`, which appears nowhere else in it: the workflow restores by key PREFIX
 * (`…-<workspace>-`), and without a terminator `u-pj` would be a prefix of `u-pj-x` and restore
 * that other user's snapshot.
 */
export function sessionWorkspaceName(
  login: string,
  repository: Pick<MachineRepository, "owner" | "name"> | null,
): string {
  const name =
    repository === null
      ? `u-${workspaceSegment(login)}`
      : `m-${workspaceSegment(login)}.${workspaceSegment(repository.owner)}.${workspaceSegment(repository.name)}`;
  const body =
    name.length <= WORKSPACE_LIMIT - 1
      ? name
      : `${name.slice(0, WORKSPACE_LIMIT - 10)}-${shortHash(name)}`;
  return `${body}_`;
}
