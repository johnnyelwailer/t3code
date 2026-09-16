import { cn } from "~/lib/utils";

/**
 * The t3team main-content header is NOT a window drag region.
 *
 * Electron's app-region hit-testing ignores z-index: a `-webkit-app-region: drag`
 * element claims every click inside its box for window dragging, and only a
 * no-drag DESCENDANT wins against it — a floating sibling loses no matter its
 * z-index (same rule documented in `routes/_chat.pull-requests.tsx`). Making
 * this full-width header a drag region put the shell's fixed
 * `T3TeamLeftSidebarDesktopToggle` (a no-drag floating sibling at
 * `--workspace-controls-left`) under a drag claim, so the expand button never
 * received clicks in windowed mode. Upstream's equivalent surface
 * (`components/chat/ChatHeader.tsx`) has no drag region in the top strip for
 * exactly this reason. Window dragging in windowed mode stays available from
 * the t3team sidebar header (`t3team-ProjectSidebarHeader.tsx`), matching
 * upstream's `SidebarChrome`.
 */
export function getT3TeamMainContentHeaderClassName(input?: {
  className?: string;
  shouldInsetDesktopHeader?: boolean;
}) {
  const { className, shouldInsetDesktopHeader = false } = input ?? {};

  return cn(
    "flex h-13 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5",
    shouldInsetDesktopHeader &&
      "pl-[var(--workspace-titlebar-content-left)] sm:pl-[var(--workspace-titlebar-content-left)]",
    "wco:h-[env(titlebar-area-height)] wco:pl-[calc(env(titlebar-area-x)+1em)] wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]",
    className,
  );
}
