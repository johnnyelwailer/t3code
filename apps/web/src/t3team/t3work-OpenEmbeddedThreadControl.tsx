import { PanelRightOpenIcon } from "lucide-react";
import { Button } from "~/t3work/components/ui/t3work-button";
import { runT3workViewTransition } from "~/t3work/t3work-runViewTransition";

export function OpenEmbeddedThreadControl({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      className="shrink-0 text-muted-foreground/80"
      onClick={() => runT3workViewTransition(onOpen)}
      aria-label="Open side-by-side view"
      title="Open side-by-side view"
    >
      <PanelRightOpenIcon className="size-4" />
    </Button>
  );
}
