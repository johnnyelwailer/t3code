import { ChevronUpIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Sheet, SheetPopup, SheetTitle } from "~/components/ui/sheet";
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

/**
 * Where the aside cannot sit beside the main view, the main view keeps the whole screen and the
 * aside (agent, chat, an opened PR or ticket) lives in a bottom drawer: a slim bar to pull it up,
 * and it rises by itself when the caller opens a detail (`activePanel` = `aside`). Kept mounted so
 * a half-written prompt or a scrolled detail survives closing it.
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
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className={cn("min-h-0 flex-1 overflow-hidden", mainClassName)} aria-label={mainLabel}>
        {main}
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onActivePanelChange("aside")}
        className="flex shrink-0 items-center justify-center gap-1.5 border-t border-border/70 bg-background/95 py-2 text-sm font-medium text-muted-foreground hover:text-foreground supports-[backdrop-filter]:bg-background/80 supports-[backdrop-filter]:backdrop-blur"
      >
        <ChevronUpIcon aria-hidden className="size-4" />
        {asideLabel}
      </button>
      <Sheet open={open} onOpenChange={(next) => onActivePanelChange(next ? "aside" : "main")}>
        <SheetPopup side="bottom" keepMounted showCloseButton={false} className="h-[85dvh]">
          <SheetTitle className="sr-only">{asideLabel}</SheetTitle>
          {/* The aside brings its own header controls, so no corner X; the handle, Escape or a tap outside close it. */}
          <button
            type="button"
            aria-label={`Close ${asideLabel}`}
            onClick={() => onActivePanelChange("main")}
            className="mx-auto flex h-5 w-16 shrink-0 items-center justify-center"
          >
            <span className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </button>
          <div className={cn("min-h-0 flex-1 overflow-hidden", asideClassName)}>{aside}</div>
        </SheetPopup>
      </Sheet>
    </div>
  );
}
