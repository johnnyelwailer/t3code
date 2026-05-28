import { CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { useSidebar } from "~/t3work/components/ui/t3work-sidebar";

export function T3workLeftSidebarDesktopToggle() {
  const { isMobile, open, toggleSidebar } = useSidebar();

  if (isMobile || open) {
    return null;
  }

  const dockStyle: CSSProperties = {
    position: "fixed",
    left: "max(env(titlebar-area-x, 0px), 0.5rem)",
    bottom: "0.5rem",
    zIndex: 40,
    pointerEvents: "none",
  };

  return (
    <div className="pointer-events-none hidden md:flex" style={dockStyle}>
      <button
        type="button"
        aria-label="Expand left sidebar"
        title="Expand left sidebar"
        className="pointer-events-auto inline-flex size-7 items-center justify-center rounded-full border border-border/70 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:text-foreground [-webkit-app-region:no-drag]"
        onClick={toggleSidebar}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
