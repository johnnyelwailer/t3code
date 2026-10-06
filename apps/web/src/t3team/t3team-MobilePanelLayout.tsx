/* oxlint-disable shadcn/no-arbitrary-values -- Base UI drawer swipe CSS vars (--drawer-swipe-*) need calc()/cubic-bezier; not expressible as theme tokens. */
import { Drawer } from "@base-ui/react/drawer";
import { ChevronUpIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

type MobilePanel = "main" | "aside";

type T3TeamMobilePanelLayoutProps = {
  /** `aside` means the drawer is open over the main view. */
  activePanel: MobilePanel;
  onActivePanelChange: (panel: MobilePanel) => void;
  main: ReactNode;
  aside: ReactNode;
  className?: string | undefined;
  mainClassName?: string | undefined;
  asideClassName?: string | undefined;
  mainLabel?: string | undefined;
  asideLabel?: string | undefined;
};

// Half height to glance, near full to read, full screen to work; a flick skips or dismisses.
const SNAP_POINTS = [0.5, 0.92, 1];

/**
 * Where the aside cannot sit beside the main view, the main view keeps the whole screen and the
 * aside (agent, chat, an opened PR or ticket) lives in a bottom drawer. It follows the finger:
 * drag or flick the bar up to open, the handle down to half or away; release speed carries it
 * (Base UI's swipe velocity drives `--drawer-swipe-strength`). It rises by itself when the caller
 * opens a detail (`activePanel` = `aside`), and stays mounted so a draft or scroll survives.
 */
export function T3TeamMobilePanelLayout({
  activePanel,
  onActivePanelChange,
  main,
  aside,
  className,
  mainClassName,
  asideClassName,
  mainLabel = "Content",
  asideLabel = "Agent",
}: T3TeamMobilePanelLayoutProps) {
  const open = activePanel === "aside";
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => onActivePanelChange(next ? "aside" : "main")}
      snapPoints={SNAP_POINTS}
      defaultSnapPoint={SNAP_POINTS[1]}
    >
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
        <div className={cn("min-h-0 flex-1 overflow-hidden", mainClassName)} aria-label={mainLabel}>
          {main}
        </div>
        {/* A real button for keyboard and screen readers; the swipe area (aria-hidden by Base UI,
            and it ignores swipes that start on a button) lies over it to catch the finger. */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => onActivePanelChange("aside")}
            className="flex w-full items-center justify-center gap-1.5 border-t border-border/70 bg-popover py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronUpIcon aria-hidden className="size-4" />
            {asideLabel}
          </button>
          <Drawer.SwipeArea
            onClick={() => onActivePanelChange("aside")}
            className="absolute inset-0 cursor-pointer touch-none"
          />
        </div>
      </div>
      <Drawer.Portal keepMounted>
        <Drawer.Backdrop className="fixed inset-0 z-(--z-sheet) bg-background/60 opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0" />
        <Drawer.Viewport className="pointer-events-none fixed inset-0 z-(--z-sheet) flex items-end justify-center">
          <Drawer.Popup
            className={cn(
              "pointer-events-auto relative flex h-dvh w-full flex-col rounded-t-2xl data-expanded:rounded-none border-t bg-popover text-popover-foreground shadow-lg/5",
              "translate-y-[calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px))]",
              "transition-transform duration-[calc(var(--drawer-swipe-strength,1)*450ms)] ease-[cubic-bezier(0.32,0.72,0,1)]",
              "data-swiping:duration-0 data-ending-style:translate-y-full data-starting-style:translate-y-full",
            )}
          >
            <Drawer.Title className="sr-only">{asideLabel}</Drawer.Title>
            {/* The handle row has the drawer's own background and room around it, so the aside's
                header controls never sit against it. Escape or a tap outside close it too. */}
            <div className="flex shrink-0 touch-none justify-center pt-2.5 pb-2">
              <span aria-hidden className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>
            <Drawer.Content className={cn("min-h-0 flex-1 overflow-hidden", asideClassName)}>
              {aside}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
