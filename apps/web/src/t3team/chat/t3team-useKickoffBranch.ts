import type { EnvironmentId } from "@t3tools/contracts";
import { useEnvironmentQuery } from "~/state/query";
import { vcsEnvironment } from "~/state/vcs";

const DETACHED_HEAD_SHA_PATTERN = /^[0-9a-f]{40}$/i;

export interface KickoffBranchResult {
  initialBranch: string | undefined;
  // While true, hold the kickoff dispatch: the branch it would carry is not resolved yet, and a
  // cold-load kickoff must not lock in `branch: null` before the real branch is known.
  isKickoffBranchQueryPending: boolean;
}

/**
 * Resolves the branch a kickoff thread should carry, from the workspace's git status — same
 * source the composer footer's branch chip reads, since the thread does not exist yet to have
 * its own. The underlying Effect atom (see ~/state/query.ts) dedupes this against the composer's
 * own query for the same cwd, so this adds no extra request.
 */
export function useKickoffBranch(input: {
  environmentId: EnvironmentId | null | undefined;
  projectWorkspaceRoot: string | undefined;
}): KickoffBranchResult {
  const { environmentId, projectWorkspaceRoot } = input;

  const kickoffGitStatusQuery = useEnvironmentQuery(
    !environmentId || !projectWorkspaceRoot
      ? null
      : vcsEnvironment.status({
          environmentId,
          input: { cwd: projectWorkspaceRoot },
        }),
  );
  const rawKickoffRefName = kickoffGitStatusQuery.data?.refName;
  // A 40-hex refName means detached HEAD (git status reports the raw sha, not a branch name) —
  // kickoff should carry no branch rather than a sha that can't be checked out as one.
  const initialBranch =
    rawKickoffRefName && !DETACHED_HEAD_SHA_PATTERN.test(rawKickoffRefName)
      ? rawKickoffRefName
      : undefined;
  // The bootstrap kickoff dispatch must not fire before this query resolves: an unresolved
  // workspace root means we don't yet know the branch, and dispatching early sends branch:null
  // for what should have been a real branch. `isPending` clears once the query settles, even on
  // error, so a hanging query can't block kickoff forever.
  const isKickoffBranchQueryPending =
    Boolean(projectWorkspaceRoot) && kickoffGitStatusQuery.isPending;

  return { initialBranch, isKickoffBranchQueryPending };
}
