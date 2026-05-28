import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

type MobilePanel = "main" | "aside";

type T3workMobilePanelLayoutProps = {
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

export function T3workMobilePanelLayout({
  activePanel,
  onActivePanelChange,
  main,
  aside,
  className,
  mainClassName,
  asideClassName,
  mainLabel = "Content",
  asideLabel = "Agent",
}: T3workMobilePanelLayoutProps) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="border-b border-border/70 bg-background/95 px-3 py-2 supports-[backdrop-filter]:bg-background/80 supports-[backdrop-filter]:backdrop-blur">
        <div className="inline-flex w-full rounded-lg border border-border/70 bg-muted/40 p-1">
          <button
            type="button"
            aria-pressed={activePanel === "main"}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activePanel === "main"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onActivePanelChange("main")}
          >
            {mainLabel}
          </button>
          <button
            type="button"
            aria-pressed={activePanel === "aside"}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activePanel === "aside"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onActivePanelChange("aside")}
          >
            {asideLabel}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activePanel === "main" ? (
          <div className={cn("h-full min-h-0 overflow-hidden", mainClassName)}>{main}</div>
        ) : (
          <div className={cn("h-full min-h-0 overflow-hidden", asideClassName)}>{aside}</div>
        )}
      </div>
    </div>
  );
}
