import { cn } from "~/lib/utils";

export function getT3workMainContentHeaderClassName(input?: {
  className?: string;
  shouldInsetDesktopHeader?: boolean;
}) {
  const { className, shouldInsetDesktopHeader = false } = input ?? {};

  return cn(
    "drag-region flex h-13 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5",
    shouldInsetDesktopHeader && "pl-[90px] sm:pl-[90px]",
    "wco:h-[env(titlebar-area-height)] wco:pl-[calc(env(titlebar-area-x)+1em)] wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]",
    className,
  );
}
