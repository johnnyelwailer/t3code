import * as NodeChildProcess from "node:child_process";
import { UPSTREAM_BASE_BRANCH, UPSTREAM_BASE_REF } from "./t3team-upstream-source-of-truth.mjs";

function git(args) {
  try {
    return NodeChildProcess.execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The newest upstream commit the fork's own main already contains.
 *
 * A branch has to carry this point, not the local `upstream/main` ref: that ref moves ahead on
 * every fetch (by any worktree or agent), so measuring against it blocks every unrelated commit
 * until the next sync merge. Falls back to the upstream ref when fork main is not known locally.
 */
export function lastSyncedUpstreamCommit() {
  const forkMain = `origin/${UPSTREAM_BASE_BRANCH}`;
  return git(["merge-base", forkMain, UPSTREAM_BASE_REF]) || UPSTREAM_BASE_REF;
}

/**
 * Pre-commit check: the current branch contains the last upstream point fork main synced.
 * Returns false without judging when the upstream ref is missing, so the caller can fall back to
 * the full command, which adds the remote.
 */
export function verifyCurrentContainsLastSynced() {
  if (git(["rev-parse", "--verify", "--quiet", `${UPSTREAM_BASE_REF}^{commit}`]) === null) {
    return false;
  }
  const synced = lastSyncedUpstreamCommit();
  if (git(["merge-base", "--is-ancestor", synced, "HEAD"]) === null) {
    throw new Error(
      `Current branch does not contain ${synced}, the last upstream commit fork main has synced. ` +
        `Merge or rebase onto origin/${UPSTREAM_BASE_BRANCH} before committing.`,
    );
  }
  console.log(`current branch contains ${synced} (last upstream point synced into fork main)`);
  return true;
}
