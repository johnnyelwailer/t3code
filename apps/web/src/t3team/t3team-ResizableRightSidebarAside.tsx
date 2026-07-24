import { ChevronLeft, ChevronRight } from "lucide-react";
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
      <div className="pointer-events-none absolute top-2 right-2 z-40">
        <button
          type="button"
          aria-label={isCollapsed ? "Expand right sidebar" : "Collapse right sidebar"}
          title={isCollapsed ? "Expand right sidebar" : "Collapse right sidebar"}
          className="pointer-events-auto inline-flex size-6 items-center justify-center rounded-full border border-border/70 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:text-foreground [-webkit-app-region:no-drag]"
          onClick={onToggleCollapsed}
        >
          {isCollapsed ? (
            <ChevronLeft className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
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
            "h-full min-h-0",
            isCollapsed ? "pointer-events-none opacity-0" : "opacity-100",
          )}
        >
          {aside}
        </div>
      </aside>
    </>
  );
}
