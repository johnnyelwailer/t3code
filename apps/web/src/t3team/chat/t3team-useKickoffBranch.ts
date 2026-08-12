import type { EnvironmentId } from "@t3tools/contracts";
import { useEnvironmentQuery } from "~/state/query";
import { vcsEnvironment } from "~/state/vcs";

const DETACHED_HEAD_SHA_PATTERN = /^[0-9a-f]{40}$/i;

export interface KickoffBranchResult {
  initialBranch: string | undefined;
}

/**
 * Resolves the branch a kickoff thread should carry, from the workspace's git status — same
 * source the composer footer's branch chip reads, since the thread does not exist yet to have
 * its own. The underlying Effect atom (see ~/state/query.ts) dedupes this against the composer's
 * own query for the same cwd, so this adds no extra request.
 *
 * This must never hold up the kickoff dispatch itself: `thread.create`/`thread.turn.start` fire
 * as soon as everything else is ready, carrying whatever branch is synchronously known (often
 * none yet, since the environment the query needs may not exist until the create dispatch itself
 * creates it — holding on it deadlocks the launch). `runThreadBootstrapEffect` watches
 * `initialBranch` and backfills it onto the already-created thread via `thread.meta.update` once
 * this query resolves.
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

  return { initialBranch };
}
