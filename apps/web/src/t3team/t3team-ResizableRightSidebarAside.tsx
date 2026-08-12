import { PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react";
import { cn } from "~/lib/utils";

type ResizableRightSidebarAsideProps = {
  aside: React.ReactNode;
  asideClassName?: string | undefined;
  asideWidth: number;
  isCollapsed: boolean;
  onResizePointerDown: React.PointerEventHandler<HTMLButtonElement>;
  onResizePointerMove: React.PointerEventHandler<HTMLButtonElement>;
  onResizePointerUp: React.PointerEventHandler<HTMLButtonElement>;
  onResizePointerCancel: React.PointerEventHandler<HTMLButtonElement>;
  onToggleCollapsed: () => void;
};

export function ResizableRightSidebarAside({
  aside,
  asideClassName,
  asideWidth,
  isCollapsed,
  onResizePointerCancel,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onToggleCollapsed,
}: ResizableRightSidebarAsideProps) {
  return (
    <>
      <div className="workspace-titlebar-controls pointer-events-none z-40 gap-1">
        <button
          type="button"
          aria-label={isCollapsed ? "Expand right sidebar" : "Collapse right sidebar"}
          title={isCollapsed ? "Expand right sidebar" : "Collapse right sidebar"}
          className="pointer-events-auto inline-flex size-[var(--workspace-titlebar-control-size)]! items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [-webkit-app-region:no-drag]"
          onClick={onToggleCollapsed}
        >
          {isCollapsed ? (
            <PanelRightOpenIcon className="size-4" />
          ) : (
            <PanelRightCloseIcon className="size-4" />
          )}
        </button>
      </div>
      <aside
        className={cn(
          "relative h-full min-h-0 shrink-0 overflow-hidden [view-transition-name:t3team-right-sidebar-shell]",
          isCollapsed ? "border-l-0" : "border-l border-border/70",
          asideClassName,
        )}
        style={{ width: isCollapsed ? 0 : asideWidth }}
      >
        {isCollapsed ? null : (
          <button
            type="button"
            aria-label="Resize right sidebar"
            title="Drag to resize right sidebar"
            className="absolute inset-y-0 left-0 z-20 w-2 -translate-x-1/2 cursor-col-resize bg-transparent"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerCancel}
          />
        )}

        <div
          className={cn(
            "box-border h-full min-h-0 pt-[var(--workspace-topbar-height)]",
            isCollapsed ? "pointer-events-none opacity-0" : "opacity-100",
          )}
        >
          {aside}
        </div>
      </aside>
    </>
  );
}
