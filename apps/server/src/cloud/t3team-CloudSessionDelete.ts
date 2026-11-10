/**
 * What a cloud session persists on its machine: the workspace's snapshots in the fleet
 * repository's Actions cache and, for a session with a repository, its resume branch.
 * Pure naming and matching rules only, no I/O, so they stay readable and testable apart.
 * Every name mirrors session.yml; hive's session-delete-names test pins the workflow side.
 */

/**
 * session.yml's run-name markers: ` · ws <workspace>` (the snapshot workspace) and
 * ` · repo <host>/<owner>/<name>` (the `session_repository` input: the repository whose resume
 * branch the machine preserves). Runs started by hand or by older clients lack them.
 */
const WORKSPACE_MARKER = / · ws ([A-Za-z0-9._-]+)/;
const REPOSITORY_MARKER =
  / · repo ([A-Za-z0-9.-]+(?::[0-9]+)?)\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)/;

/** A repository as the run name and the delete name it: the host keeps two forges apart. */
export interface SessionRepository {
  readonly host: string;
  readonly owner: string;
  readonly name: string;
}

/**
 * What a delete can read back from a run's name. `null` fields are "unknown", not "none":
 * a delete that cannot identify the machine's repository refuses instead of guessing one.
 */
export interface SessionRunIdentity {
  readonly workspace: string | null;
  readonly repository: SessionRepository | null;
}

/** The `session_repository` dispatch input that session.yml echoes as the ` · repo` marker. */
export function sessionRepositoryInput(repository: SessionRepository): string {
  return `${repository.host}/${repository.owner}/${repository.name}`;
}

export function parseSessionRunIdentity(runName: string): SessionRunIdentity {
  const workspace = WORKSPACE_MARKER.exec(runName)?.[1] ?? null;
  const [, host, owner, name] = REPOSITORY_MARKER.exec(runName) ?? [];
  return {
    workspace,
    repository:
      host === undefined || owner === undefined || name === undefined
        ? null
        : { host, owner, name },
  };
}

/**
 * session.yml "Save session snapshot": `nexi-session-userdata-<owner>.<workspace>/<run id>`, the
 * handoff's final save with `-final`. The restore matches the `<owner>.<workspace>/` prefix.
 */
const SNAPSHOT_CACHE_KEY =
  /^nexi-session-userdata-(g[0-9]+|o[0-9a-f]{32})\.([A-Za-z0-9._-]+)\/([0-9]+)(?:-final)?$/;

export interface SnapshotCacheKey {
  readonly owner: string;
  readonly workspace: string;
  readonly runId: number;
}

export function parseSnapshotCacheKey(key: string): SnapshotCacheKey | null {
  const [, owner, workspace, runId] = SNAPSHOT_CACHE_KEY.exec(key) ?? [];
  if (owner === undefined || workspace === undefined || runId === undefined) return null;
  return { owner, workspace, runId: Number(runId) };
}

/** The machine's resume branch, where machine-preserve.sh pushes its checkout. */
export function resumeBranchName(snapshotOwner: string, workspace: string): string {
  return `nexi-resume/${snapshotOwner}/${workspace}`;
}

/** The branch a delete saves one run's unpushed work to; per run, so no save overwrites another. */
export function wipBranchName(workspace: string, runId: number): string {
  return `wip/nexi-${workspace.replace(/_+$/, "")}-${runId}`;
}

/**
 * Whether the resume branch's tip carries work that exists nowhere the user pushed it: the
 * branch holds the agents' unpushed commits plus their uncommitted work as one marked commit
 * on top, so any tip that differs from the commit the machine was pinned to is worth saving.
 */
export function resumeTipHasUnpushedWork(tipSha: string, pinnedSha: string | null): boolean {
  if (tipSha === "") return false;
  if (pinnedSha === null) return true; // unknown base: a needless save beats a lost one
  return tipSha.toLowerCase() !== pinnedSha.toLowerCase();
}
