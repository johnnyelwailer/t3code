import { cn } from "~/lib/utils";

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

/**
 * The header sits in the window drag strip's band (`t3team-WindowDragStrip.tsx`). As a
 * `.drag-region` its buttons, links and inputs opt out of dragging, so they stay clickable.
 */
export function getT3TeamMainContentHeaderClassName(input?: {
  className?: string;
  shouldInsetDesktopHeader?: boolean;
}) {
  const { className, shouldInsetDesktopHeader = false } = input ?? {};

  return cn(
    "drag-region flex h-13 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5",
    shouldInsetDesktopHeader &&
      "pl-(--workspace-titlebar-content-left) sm:pl-(--workspace-titlebar-content-left)",
    "wco:h-[env(titlebar-area-height)] wco:pl-(--workspace-controls-left) wco:pr-(--workspace-native-controls-inset)",
    COLLAPSED_RIGHT_SIDEBAR_TITLEBAR_INSET_CLASS,
    className,
  );
}
