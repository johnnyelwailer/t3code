import ThreadSidebarV2 from "~/components/SidebarV2";

/**
 * The Work lens: upstream's Inbox sidebar, hosted inside the T3 Team shell.
 *
 * Upstream's `SidebarV2` is mounted unmodified — it reads the same thread,
 * project and settings state the Team shell already provides, and its
 * navigation is translated to Team routes by the shell's upstream route bridge
 * (`t3team-useUpstreamRouteBridge`). Team context is layered in through the
 * narrow slots in `t3team-inboxSlots`, so upstream's file keeps a near-zero
 * fork diff and stays cheap to re-merge.
 */
export function InboxSidebar() {
  return <ThreadSidebarV2 />;
}
