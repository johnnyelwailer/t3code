import { EllipsisIcon, SquarePenIcon } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3work/components/ui/t3work-tooltip";

type LocalWorkspaceSidebarRowActionsProps = {
  projectTitle: string;
  onNewThread: (event: React.MouseEvent) => void;
  onOpenMenu: (event: React.MouseEvent) => void;
};

export function LocalWorkspaceSidebarRowActions({
  projectTitle,
  onNewThread,
  onOpenMenu,
}: LocalWorkspaceSidebarRowActionsProps) {
  return (
    <div className="pointer-events-none absolute top-1 right-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-150 max-sm:pointer-events-auto max-sm:opacity-100 group-hover/project-header:pointer-events-auto group-hover/project-header:opacity-100 group-focus-within/project-header:pointer-events-auto group-focus-within/project-header:opacity-100">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`Create new thread in ${projectTitle}`}
              className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              onClick={onNewThread}
            >
              <SquarePenIcon className="size-3.5" />
            </button>
          }
        />
        <TooltipPopup side="top">New thread</TooltipPopup>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`Workspace actions for ${projectTitle}`}
              className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              onClick={onOpenMenu}
            >
              <EllipsisIcon className="size-3.5" />
            </button>
          }
        />
        <TooltipPopup side="top">Workspace actions</TooltipPopup>
      </Tooltip>
    </div>
  );
}
