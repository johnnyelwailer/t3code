import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ScopedThreadRef } from "@t3tools/contracts";

import ThreadSidebar from "~/components/Sidebar";
import { useThreadShells } from "~/state/entities";
import { setT3TeamThreadNavigationOverride } from "~/t3team/t3team-threadNavigationOverride";

/**
 * The Work lens: upstream's Inbox sidebar, hosted inside the T3 Team shell.
 *
 * Upstream's `Sidebar` (the former `SidebarV2`, promoted to the default sidebar
 * in #5672) is mounted unmodified — it reads the same thread, project and
 * settings state the Team shell already provides, and its navigation is
 * translated to Team routes by the shell's upstream route bridge
 * (`t3team-useUpstreamRouteBridge`). Team context is layered in through the
 * narrow slots in `t3team-inboxSlots`, so upstream's file keeps a near-zero
 * fork diff and stays cheap to re-merge.
 */
export function InboxSidebar() {
  const navigate = useNavigate();
  const threadShells = useThreadShells();

  // The handler runs only inside click events, so it reads the latest shells
  // through a ref; re-registering per shells change would be pure churn.
  const threadShellsRef = useRef(threadShells);
  threadShellsRef.current = threadShells;

  // Thread clicks must navigate WITHIN the /t3team tree. Upstream's own
  // navigation targets `/$environmentId/$threadId`, which unmounts the whole
  // Team shell and lets the route bridge remount it one navigation later —
  // that unmount/remount cycle re-created every sidebar row on each thread
  // selection (GHE #61). Threads the shell cannot place yet (no projectId)
  // fall back to upstream navigation + the route bridge.
  useEffect(() => {
    setT3TeamThreadNavigationOverride((threadRef: ScopedThreadRef) => {
      const shells = threadShellsRef.current;
      const projectId =
        shells.find(
          (shell) =>
            shell.id === threadRef.threadId && shell.environmentId === threadRef.environmentId,
        )?.projectId ??
        shells.find((shell) => shell.id === threadRef.threadId)?.projectId ??
        null;
      if (projectId === null) return false;
      void navigate({
        to: "/t3team/projects/$projectId/threads/$threadId",
        params: { projectId, threadId: threadRef.threadId },
        search: (current: Record<string, unknown>) => current,
      });
      return true;
    });
    return () => setT3TeamThreadNavigationOverride(null);
  }, [navigate]);

  // Upstream mounts the sidebar's fragment directly inside a column layout, but the
  // Team shell wraps the lens in a row flex (the Code lens supplies its own
  // column). Without this the header collapses to zero width and overlaps the
  // rows beneath it.
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ThreadSidebar />
    </div>
  );
}
