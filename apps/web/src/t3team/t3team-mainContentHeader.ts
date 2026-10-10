import { cn } from "~/lib/utils";

/**
 * The t3team main-content header is NOT a window drag region.
 *
 * Electron's app-region hit-testing ignores z-index: a `-webkit-app-region: drag`
 * element claims every click inside its box for window dragging, and only a no-drag
 * DESCENDANT wins against it — a floating sibling loses no matter its z-index (same
 * rule documented in `routes/_chat.pull-requests.tsx`). Making this full-width
 * header a drag region put the shell's fixed
 * `T3TeamLeftSidebarDesktopToggle` (a no-drag floating sibling at
 * `--workspace-controls-left`) under a drag claim, so the expand button never
 * received clicks in windowed mode.
 *
 * The earlier CSS attempt (index.css `[data-sidebar-state="collapsed"]
 * header.drag-region::before`) carved a 3rem no-drag zone from the header's left
 * edge, sized for the default `--workspace-controls-left: 12px`. In windowed macOS
 * the inset hook moves the toggle to `--workspace-controls-left: 90px`, which the
 * 3rem carve-out does not reach — so the bug persisted there. Removing the class
 * covers every inset at once; the carve-out stays for the upstream
 * `WorkspacePageHeader` drag regions it still protects.
 *
 * Upstream's equivalent surface (`components/chat/ChatHeader.tsx`) has no drag
 * region in the top strip for the same reason. Window dragging in windowed mode
 * stays available from the t3team sidebar header
 * (`t3team-ProjectSidebarHeader.tsx`), matching upstream's `SidebarChrome`.
 */
/**
 * While the right aside of a `ResizableRightSidebarLayout` is collapsed (desktop layout, `lg`+),
 * its floating `.workspace-titlebar-controls` toggle sits over the main column's header. Reserve
 * the toggle's footprint (`--right-sidebar-toggle-inset`, set on the layout root) so the header's right-edge content (e.g. the My Work / Backlog tab row)
 * is never covered. Expanded, the toggle sits over the aside's own topbar band instead, so no
 * reservation applies. The `wco:` copy outranks the base `wco:pr-(--workspace-native-controls-inset)`
 * (in WCO, `--workspace-controls-right` already includes the native controls inset).
 */
export const COLLAPSED_RIGHT_SIDEBAR_TITLEBAR_INSET_CLASS =
  "lg:[[data-right-sidebar=collapsed]_&]:pr-(--right-sidebar-toggle-inset) wco:lg:[[data-right-sidebar=collapsed]_&]:pr-(--right-sidebar-toggle-inset)";

export function getT3TeamMainContentHeaderClassName(input?: {
  className?: string;
  shouldInsetDesktopHeader?: boolean;
}) {
  const { className, shouldInsetDesktopHeader = false } = input ?? {};

  return cn(
    "flex h-13 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5",
    shouldInsetDesktopHeader &&
      "pl-(--workspace-titlebar-content-left) sm:pl-(--workspace-titlebar-content-left)",
    "wco:h-[env(titlebar-area-height)] wco:pl-(--workspace-controls-left) wco:pr-(--workspace-native-controls-inset)",
    COLLAPSED_RIGHT_SIDEBAR_TITLEBAR_INSET_CLASS,
    className,
  );
}
