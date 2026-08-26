import { useMemo } from "react";

import { mergeEnvironmentThread } from "@t3tools/client-runtime/state/threads";
import type { EnvironmentThread } from "@t3tools/client-runtime/state/shell";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { useThreadRefs, useThreadShells } from "~/state/entities";
import { environmentThreadDetails } from "~/state/threads";

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
  return useMemo(
    () =>
      shells.flatMap((shell) => {
        const thread = mergeEnvironmentThread(
          appAtomRegistry.get(
            environmentThreadDetails.detailAtom({
              environmentId: shell.environmentId,
              threadId: shell.id,
            }),
          ),
          shell,
        );
        return thread ? [thread] : [];
      }),
    [refs, shells],
  );
}
