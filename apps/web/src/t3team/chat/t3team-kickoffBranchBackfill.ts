import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { ThreadBootstrapDispatchState } from "~/t3team/chat/t3team-threadBootstrapPlan";
import { recordT3TeamThreadDebug } from "~/t3team/chat/t3team-threadDebug";
import { randomUUID } from "~/lib/utils";

/**
 * Backfills the branch onto an already-dispatched thread once the workspace's git status query
 * resolves. The create/kickoff dispatch never waits for that query (see
 * `runThreadBootstrapEffect`), so it may have gone out with `branch: null`; once `initialBranch`
 * has a real value this sends it via `thread.meta.update`, guarded by `expectedBranch: null` so it
 * never clobbers a branch the user (or a later turn) already set explicitly, and by
 * `branchBackfillSent` so it fires at most once per thread.
 */
export function maybeBackfillKickoffBranch(input: {
  backend: BackendApi;
  threadId: string;
  initialBranch: string | undefined;
  hasServerThread: boolean;
  state: ThreadBootstrapDispatchState;
}): void {
  const { backend, threadId, initialBranch, hasServerThread, state } = input;

  // Only fires for a thread THIS hook dispatched with an unresolved branch (`dispatchedBranch ===
  // null`). `undefined` means nothing was dispatched here (e.g. a server thread that showed up
  // without our bootstrap) and a string means the branch is already set — either way, no backfill.
  // `hasServerThread` gates on the thread provably existing server-side: `kickoffSent` flips
  // synchronously long before `thread.create` lands, and a backfill dispatched into that window is
  // rejected — with one interleaving (serverThread arrives while the doomed send is in flight)
  // where the reset flag never gets another effect pass and the thread stayed branchless forever.
  if (
    !hasServerThread ||
    state.dispatchedBranch !== null ||
    state.branchBackfillSent ||
    initialBranch === undefined
  ) {
    return;
  }

  state.branchBackfillSent = true;
  void backend
    .dispatchCommand({
      type: "thread.meta.update",
      commandId: randomUUID() as any,
      threadId: threadId as any,
      branch: initialBranch,
      expectedBranch: null,
    })
    .then(() => {
      state.dispatchedBranch = initialBranch;
    })
    .catch((error) => {
      state.branchBackfillSent = false;
      recordT3TeamThreadDebug("thread-bootstrap.branch-backfill.failure", {
        threadId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}
