/**
 * Pure naming rules for cloud sessions: the per-user workspace a session's conversations persist
 * under, the standby pool key, and the commit identity. Shared by the server and the phone, so
 * nothing here may reach Node, `URL.parse`, or the server's git layer. Parsing a checkout's
 * `origin` into a `MachineRepository` stays on the server (`t3team-cloudSessionMachineNames.ts`).
 *
 * @module t3team-cloudSessionWorkspace
 */

export interface MachineRepository {
  /** `https://<host>/<owner>/<repo>.git`, never carrying credentials. */
  readonly url: string;
  readonly host: string;
  readonly owner: string;
  readonly name: string;
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
 * that other user's snapshot. A name that had to be rewritten (an unsafe character, or too long)
 * carries a hash of the raw identity, so `acme/my_repo` and `acme/my-repo` stay apart.
 */
export function sessionWorkspaceName(
  login: string,
  repository: Pick<MachineRepository, "owner" | "name"> | null,
): string {
  const parts = repository === null ? [login] : [login, repository.owner, repository.name];
  const raw = `${repository === null ? "u" : "m"}-${parts.join(".")}`;
  const name = `${repository === null ? "u" : "m"}-${parts.map(workspaceSegment).join(".")}`;
  if (name === raw && name.length <= WORKSPACE_LIMIT - 1) return `${name}_`;
  return `${name.slice(0, WORKSPACE_LIMIT - 10)}-${shortHash(JSON.stringify(parts))}_`;
}

/** The project's pool: `<owner>.<repo>`, lower case — the prefix of its prebuilt image tags. */
export function standbyPoolKey(repository: Pick<MachineRepository, "owner" | "name">): string {
  return `${repository.owner}/${repository.name}`
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, ".")
    .slice(0, 100);
}
