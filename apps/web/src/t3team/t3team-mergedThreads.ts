import { useMemo } from "react";

import { mergeEnvironmentThread } from "@t3tools/client-runtime/state/threads";
import type { EnvironmentThread } from "@t3tools/client-runtime/state/shell";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { useThreadRefs, useThreadShells } from "~/state/entities";
import { environmentThreadDetails } from "~/state/threads";
import { indexT3TeamChildParentThreads } from "~/t3team/hooks/t3team-threadHandoffMetadata";

/**
 * Child threads learned from their parents' `t3team.handoff.started` activities, keyed
 * `environmentId:threadId`. Only grows: a thread that was handed off to stays a child.
 *
 * A known child merges from its shell alone. Reading its detail atom here opened a full
 * thread-detail stream per child that expired after the retention TTL and reopened on the
 * next shell update — 40–48 subscribe/drop cycles a minute with a few dozen threads
 * (measured 2026-09-28), scaling with every orchestration fan-out. A child's live state
 * (session, latest turn, childStatus, activity label, actionable plan) already arrives on
 * the shell stream.
 */
const knownChildThreadKeys = new Set<string>();

export function resetKnownChildThreadsForTests(): void {
  knownChildThreadKeys.clear();
}

function rememberChildren(threads: ReadonlyArray<EnvironmentThread>): void {
  for (const thread of threads) {
    for (const childThreadId of indexT3TeamChildParentThreads([thread]).keys()) {
      knownChildThreadKeys.add(`${thread.environmentId}:${childThreadId}`);
    }
  }
}

/**
 * Merged (shell + detail) thread list.
 *
 * The list is derived from the LIVE shell list, not just the ref list: every
 * `thread-upserted` shell-stream event (status changes included) updates
 * `threadShellsAtom` in place while keeping referential stability when the
 * snapshot is unchanged (`arrayElementsEqual`). Keying the memo on refs alone
 * re-computed only when thread membership changed and left child status
 * transitions (running → waiting → completed/failed) stale in the sidebar and
 * the Agents panel until a thread was added or removed (GHE #234).
 *
 * The shell list must also flow through the callback body itself, not only the
 * deps array: the app runs under the React compiler (`reactCompilerPreset`),
 * which replaces `useMemo` with its own cache keyed on the values the callback
 * actually reads — a dep-array-only reference is discarded.
 *
 * `appAtomRegistry.get` stays a non-reactive snapshot read on purpose: the
 * shell element carries every metadata field the merge treats as authoritative
 * (session, latestTurn, childStatus, activity*), and the detail stream atoms
 * must not spawn a live per-thread WS subscription for every sidebar row.
 */
export function useMergedThreads(): ReadonlyArray<EnvironmentThread> {
  const refs = useThreadRefs();
  const shells = useThreadShells();

  // `threadRefsAtom` is derived from the same shell source as
  // `threadShellsAtom`, so `shells` is always at least as fresh as `refs`;
  // iterating it directly makes the live shell list the memo's real input
  // (refs stays a dep for the empty/membership cases).
  return useMemo(() => {
    const merged = shells.flatMap((shell) => {
      const isKnownChild = knownChildThreadKeys.has(`${shell.environmentId}:${shell.id}`);
      const detail = isKnownChild
        ? null
        : appAtomRegistry.get(
            environmentThreadDetails.detailAtom({
              environmentId: shell.environmentId,
              threadId: shell.id,
            }),
          );
      const thread = mergeEnvironmentThread(detail, shell);
      return thread ? [thread] : [];
    });
    rememberChildren(merged);
    return merged;
  }, [refs, shells]);
}
