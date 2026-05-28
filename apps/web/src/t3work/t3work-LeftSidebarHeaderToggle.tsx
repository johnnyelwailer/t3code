import { ChevronLeft } from "lucide-react";
import { Button } from "~/t3work/components/ui/t3work-button";
import { useSidebar } from "~/t3work/components/ui/t3work-sidebar";

export function T3workLeftSidebarHeaderToggle() {
  const { isMobile, open, toggleSidebar } = useSidebar();

  if (isMobile || !open) {
    return null;
  }

  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      className="shrink-0 text-muted-foreground/70 hover:text-foreground"
      aria-label="Collapse left sidebar"
      title="Collapse left sidebar"
      onClick={toggleSidebar}
    >
      <ChevronLeft className="size-4" />
    </Button>
  );
}
