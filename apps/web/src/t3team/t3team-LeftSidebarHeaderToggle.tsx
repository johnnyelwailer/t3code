import { PanelLeftCloseIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/t3team/components/ui/t3team-button";
import { useSidebar } from "~/t3team/components/ui/t3team-sidebar";

type T3TeamLeftSidebarHeaderToggleProps = {
  /**
   * `"row"` (default) is the footer placement next to Settings: always
   * visible, no backdrop. `"banner"` is the header placement that floats
   * over a pack-configurable background image — it hides until the header
   * is hovered/focused, and gets a translucent backdrop so it stays legible
   * over an arbitrary image in either theme. Requires an ancestor with
   * `group/sidebar-header`.
   */
  surface?: "banner" | "row";
};

export function T3TeamLeftSidebarHeaderToggle({
  surface = "row",
}: T3TeamLeftSidebarHeaderToggleProps) {
  const { isMobile, open, toggleSidebar } = useSidebar();

  if (isMobile || !open) {
    return null;
  }

  const isBanner = surface === "banner";

  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      className={cn(
        "shrink-0 text-muted-foreground/70 hover:text-foreground",
        isBanner &&
          // Dynamic contrast over arbitrary banner imagery: a translucent,
          // blurred backdrop tinted by the theme's own `--background` reads
          // correctly in light and dark without hardcoding either. Hidden
          // until the header is hovered/focused so it doesn't sit on top of
          // the banner at rest.
          "rounded-md bg-background/55 opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover/sidebar-header:opacity-100 group-focus-within/sidebar-header:opacity-100 focus-visible:opacity-100",
      )}
      aria-label="Collapse left sidebar"
      title="Collapse left sidebar"
      onClick={toggleSidebar}
    >
      <PanelLeftCloseIcon className="size-4" />
    </Button>
  );
}
