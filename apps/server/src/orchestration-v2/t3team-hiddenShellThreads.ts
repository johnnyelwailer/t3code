/**
 * Host-machinery threads never appear on the V2 shell (sidebar, notifications, archive).
 *
 * A workflow's "Orchestration author" thread is a parentless, headless spawn the workflow host
 * drives for its own bookkeeping (t3team-workflowAuthorTurn.ts). Subagents are hidden by their
 * `subagent` lineage; the author has no parent to hang under, so it is dropped instead: from
 * shell snapshots (active and archive) in the orchestrator's `getShellSnapshot`/`readShellSnapshot`,
 * from the active shell index (`listActiveShellIndex`, which feeds the older-settled counts), and from live
 * shell deltas in ws.ts. The thread itself
 * stays: the host still reads, drives and retires it.
 */
import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";

import { isWorkflowAuthorThread } from "../t3team-workflowAuthorSession.ts";

const isHiddenShellThread = (shell: Pick<OrchestrationV2ThreadShell, "id" | "lineage">): boolean =>
  isWorkflowAuthorThread(shell.id) && shell.lineage.parentThreadId === null;

const visibleShellThreads = <T extends Pick<OrchestrationV2ThreadShell, "id" | "lineage">>(
  threads: ReadonlyArray<T>,
): ReadonlyArray<T> => threads.filter((thread) => !isHiddenShellThread(thread));

/** A shell snapshot without host-machinery threads (both reads of the orchestrator use it). */
export const visibleShellSnapshot = <
  T extends {
    readonly threads: ReadonlyArray<Pick<OrchestrationV2ThreadShell, "id" | "lineage">>;
    readonly archivedThreads: ReadonlyArray<Pick<OrchestrationV2ThreadShell, "id" | "lineage">>;
  },
>(
  snapshot: T,
): T => ({
  ...snapshot,
  threads: visibleShellThreads(snapshot.threads),
  archivedThreads: visibleShellThreads(snapshot.archivedThreads),
});

/** The active shell index (what trims and older-settled counts read) without host-machinery threads. */
export const visibleShellIndex = <T extends Pick<OrchestrationV2ThreadShell, "id" | "lineage">>(
  index: ReadonlyArray<T>,
): ReadonlyArray<T> => visibleShellThreads(index);

/** The shell the transport may show: a hidden thread reads as gone (deltas become removals). */
export const shownShell = <T extends Pick<OrchestrationV2ThreadShell, "id" | "lineage">>(
  shell: T | null,
): T | null => (shell !== null && isHiddenShellThread(shell) ? null : shell);
