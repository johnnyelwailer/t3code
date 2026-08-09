/**
 * Single-launch guard for recipe workflows.
 *
 * One Quick Start "send" can reach `backend.launchRecipeWorkflow` from two independent web
 * paths for the same thread: the eager thread-bootstrap kickoff
 * ({@link import("./t3team-runThreadBootstrapKickoff").runThreadBootstrapKickoff}) and the
 * composer's turn-start override
 * ({@link import("./t3team-recipeWorkflowLaunch").launchPendingRecipeWorkflowTurn}). Without a
 * guard both fire and the durable engine spawns two runs for one click. Each path claims the
 * launch thread synchronously before dispatching; the first claim wins, the second no-ops.
 *
 * A recipe launch always opens a fresh thread, so a per-thread claim is launch-once by
 * construction — but it DOES need releasing on an explicit retry. A claim taken by an attempt that
 * then failed (or never got as far as dispatching) is indistinguishable from a successful one, so
 * without a release the retry recreates the thread and silently skips the launch: the user clicks
 * "Retry launch", nothing is requested, and no run is ever created.
 */

const claimedLaunchThreadIds = new Set<string>();

/** Returns `true` for the first caller for a given thread, `false` for every caller after. */
export function tryClaimRecipeWorkflowLaunch(threadId: string): boolean {
  if (claimedLaunchThreadIds.has(threadId)) {
    return false;
  }
  claimedLaunchThreadIds.add(threadId);
  return true;
}

/** Drops the claim so a user-driven retry can launch this thread's workflow again. */
export function releaseRecipeWorkflowLaunchClaim(threadId: string): void {
  claimedLaunchThreadIds.delete(threadId);
}
