/**
 * Host-machinery threads never appear on the V2 shell (sidebar, notifications, archive).
 *
 * A workflow's "Orchestration author" thread is a parentless, headless spawn the workflow host
 * drives for its own bookkeeping (t3team-workflowAuthorTurn.ts). Subagents are hidden by their
 * `subagent` lineage; the author has no parent to hang under, so it is dropped instead: from
 * shell snapshots (active and archive) in the orchestrator's `getShellSnapshot`, and from live
 * shell deltas in ws.ts. The thread itself
 * stays: the host still reads, drives and retires it.
 */
import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";

import { isWorkflowAuthorThread } from "../t3team-workflowAuthorSession.ts";

const isHiddenShellThread = (shell: Pick<OrchestrationV2ThreadShell, "id" | "lineage">): boolean =>
  isWorkflowAuthorThread(shell.id) && shell.lineage.parentThreadId === null;

export const visibleShellThreads = <T extends Pick<OrchestrationV2ThreadShell, "id" | "lineage">>(
  threads: ReadonlyArray<T>,
): ReadonlyArray<T> => threads.filter((thread) => !isHiddenShellThread(thread));

/** The shell the transport may show: a hidden thread reads as gone (deltas become removals). */
export const shownShell = <T extends Pick<OrchestrationV2ThreadShell, "id" | "lineage">>(
  shell: T | null,
): T | null => (shell !== null && isHiddenShellThread(shell) ? null : shell);
