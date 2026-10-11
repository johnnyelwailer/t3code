/**
 * `LaunchedThread.read()`: the thread shell as a workflow body sees it. Only what the server
 * already keeps fresh (the shell and each link's synced snapshot and watch); no host read.
 */
import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";
import {
  visibleThreadPullRequests,
  threadPullRequestsOf,
} from "@t3tools/shared/threadPullRequests";
import type { LaunchedThreadState } from "@t3team/sdk";

export function launchedThreadState(shell: OrchestrationV2ThreadShell): LaunchedThreadState {
  const pending = shell.pendingRuntimeRequest?.kind ?? null;
  return {
    threadId: shell.id,
    deleted: shell.deletedAt !== null,
    archived: shell.archivedAt !== null,
    settled: shell.settledOverride === "settled" || shell.settledAt !== null,
    runtimeMode: shell.runtimeMode,
    model: `${shell.modelSelection.instanceId}/${shell.modelSelection.model}`,
    working: shell.activeRunId !== null,
    pendingQuestion: pending === "user_input",
    pendingApproval: pending !== null && pending !== "user_input",
    pullRequests: visibleThreadPullRequests(threadPullRequestsOf(shell)).map((link) => ({
      host: link.host,
      repository: link.repository,
      number: link.number,
      url: link.url,
      snapshot:
        link.snapshot === null
          ? null
          : {
              state: link.snapshot.state,
              title: link.snapshot.title,
              headBranch: link.snapshot.headBranch,
              baseBranch: link.snapshot.baseBranch,
              isDraft: link.snapshot.isDraft,
              author: link.snapshot.author?.login ?? null,
              checksState: link.snapshot.checksState ?? null,
              mergeability: link.snapshot.mergeability ?? null,
              reviewDecision: link.snapshot.reviewDecision ?? null,
              updatedAt: link.snapshot.updatedAt,
            },
      watching: link.watch !== undefined,
      watchHeadSha: link.watch?.headSha ?? null,
    })),
  };
}
