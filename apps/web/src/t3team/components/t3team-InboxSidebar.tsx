import ThreadSidebar from "~/components/Sidebar";

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
