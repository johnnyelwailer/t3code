import { cn } from "~/lib/utils";

export function getT3TeamMainContentHeaderClassName(input?: {
  className?: string;
  shouldInsetDesktopHeader?: boolean;
}) {
  const { className, shouldInsetDesktopHeader = false } = input ?? {};

  return cn(
    "drag-region flex h-13 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5",
    shouldInsetDesktopHeader &&
      "pl-[var(--workspace-titlebar-content-left)] sm:pl-[var(--workspace-titlebar-content-left)]",
    "wco:h-[env(titlebar-area-height)] wco:pl-[calc(env(titlebar-area-x)+1em)] wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]",
    className,
  );
}
