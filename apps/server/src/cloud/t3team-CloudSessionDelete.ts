/**
 * What a cloud session persists on its machine: the workspace's snapshots in the fleet
 * repository's Actions cache and, for a session with a repository, its resume branch.
 * Pure naming and matching rules only, no I/O, so they stay readable and testable apart.
 */

/** The Actions-cache key prefix every session snapshot save uses (session.yml "Save session snapshot"). */
const SNAPSHOT_CACHE_KEY_PREFIX = "nexi-session-userdata-";

/**
 * The markers session.yml's run-name carries: ` · ws <workspace>` (the snapshot workspace,
 * present on every session the app dispatches) and ` · repo <owner>/<name>` (the repository
 * whose resume branch the machine preserves). Both are absent on runs started by hand from
 * the Actions tab and on runs dispatched before the markers existed.
 */
const WORKSPACE_MARKER = / · ws ([A-Za-z0-9._-]+)/;
const REPOSITORY_MARKER = / · repo ([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)/;

/**
 * What a delete can read back from a run's name. `null` fields are "unknown", not "none":
 * a delete that cannot identify the machine's repository still removes what it can (the
 * snapshots) and says so, instead of guessing a repository.
 */
export interface SessionRunIdentity {
  readonly workspace: string | null;
  readonly repository: {
    readonly owner: string;
    readonly name: string;
  } | null;
}

export function parseSessionRunIdentity(runName: string): SessionRunIdentity {
  const workspace = WORKSPACE_MARKER.exec(runName)?.[1] ?? null;
  const repository = REPOSITORY_MARKER.exec(runName);
  const owner = repository?.[1];
  const name = repository?.[2];
  return {
    workspace,
    repository: owner === undefined || name === undefined ? null : { owner, name },
  };
}

/**
 * Whether a fleet-repository Actions cache key is this run's session snapshot: the plain save
 * and the handoff's final save both key on the run id (`…/<runId>` and `…/<runId>-final`).
 * The prefix keeps a cache entry of any other workflow from ever matching.
 */
export function isSessionSnapshotKeyForRun(key: string, runId: number): boolean {
  if (!key.startsWith(SNAPSHOT_CACHE_KEY_PREFIX)) return false;
  return key.endsWith(`/${runId}`) || key.endsWith(`/${runId}-final`);
}

/** The machine's resume branch, where machine-preserve.sh pushes its checkout. */
export function resumeBranchName(owner: string, workspace: string): string {
  return `nexi-resume/${owner}/${workspace}`;
}

/**
 * The branch a delete saves the machine's unpushed work to, one per machine: the machine is
 * identified by its workspace, so re-deleting it (or deleting after a stop that preserved
 * again) lands on the same branch, over the older save.
 */
export function wipBranchName(workspace: string): string {
  return `wip/nexi-${workspace.replace(/_+$/, "")}`;
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
