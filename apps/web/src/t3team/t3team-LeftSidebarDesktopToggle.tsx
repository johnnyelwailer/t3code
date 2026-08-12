import { CSSProperties } from "react";
import { PanelLeftIcon } from "lucide-react";
import { useSidebar } from "~/t3team/components/ui/t3team-sidebar";

export function T3TeamLeftSidebarDesktopToggle() {
  const { isMobile, open, toggleSidebar } = useSidebar();

  if (isMobile || open) {
    return null;
  }

  const dockStyle: CSSProperties = {
    position: "fixed",
    left: "var(--workspace-controls-left)",
    top: "var(--workspace-controls-top)",
    height: "var(--workspace-topbar-height)",
    zIndex: 50,
    pointerEvents: "none",
  };

  return (
    <div
      className="pointer-events-none hidden items-center md:flex"
      style={dockStyle}
      data-sidebar-control=""
    >
      <button
        type="button"
        aria-label="Expand left sidebar"
        title="Expand left sidebar"
        className="pointer-events-auto inline-flex size-[var(--workspace-titlebar-control-size)]! items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [-webkit-app-region:no-drag]"
        onClick={toggleSidebar}
      >
        <PanelLeftIcon className="size-4" />
      </button>
    </div>
  );
}
