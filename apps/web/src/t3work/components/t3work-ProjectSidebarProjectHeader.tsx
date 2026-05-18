import { ChevronRightIcon, EllipsisIcon, SquarePenIcon } from "lucide-react";
import type { KeyboardEvent, MouseEvent, RefObject } from "react";
import { SidebarMenuButton } from "~/t3work/components/ui/t3work-sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3work/components/ui/t3work-tooltip";
import { ProjectIcon } from "./t3work-ProjectIcon";
import type { ProjectRowProps } from "./t3work-projectSidebarProjectRowTypes";

type ProjectStatus = {
  label: string;
  colorClass: string;
  dotClass: string;
  pulse?: boolean;
};

type ProjectSidebarProjectHeaderProps = {
  project: ProjectRowProps["project"];
  expanded: boolean;
  projectStatus: ProjectStatus | null;
  isRenaming: boolean;
  renameInputRef: RefObject<HTMLInputElement | null>;
  renameTitle: string;
  setRenameTitle: (value: string) => void;
  onProjectClick: () => void;
  onContextMenu: (event: MouseEvent) => void;
  onToggleExpand: (event: MouseEvent | KeyboardEvent) => void;
  onRenameKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onRenameSubmit: () => void;
  onNewThread: (event: MouseEvent) => void;
  onOpenMenu: (event: MouseEvent) => void;
};

export function ProjectSidebarProjectHeader({
  project,
  expanded,
  projectStatus,
  isRenaming,
  renameInputRef,
  renameTitle,
  setRenameTitle,
  onProjectClick,
  onContextMenu,
  onToggleExpand,
  onRenameKeyDown,
  onRenameSubmit,
  onNewThread,
  onOpenMenu,
}: ProjectSidebarProjectHeaderProps) {
  return (
    <div className="group/project-header relative mb-1">
      <SidebarMenuButton
        size="sm"
        className="gap-2 px-2 py-1.5 pr-8 text-left hover:bg-accent group-hover/project-header:bg-accent group-hover/project-header:text-sidebar-accent-foreground max-sm:pr-14 cursor-pointer"
        onClick={onProjectClick}
        onContextMenu={onContextMenu}
      >
        <span
          role="button"
          tabIndex={0}
          aria-label={expanded ? `Collapse ${project.title}` : `Expand ${project.title}`}
          className="-ml-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:bg-accent/60 hover:text-foreground"
          onClick={onToggleExpand}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggleExpand(event);
            }
          }}
        >
          {!expanded && projectStatus ? (
            <span
              aria-hidden
              title={projectStatus.label}
              className={`relative inline-flex size-3.5 items-center justify-center ${projectStatus.colorClass}`}
            >
              <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/project-header:opacity-0">
                <span
                  className={`size-[9px] rounded-full ${projectStatus.dotClass} ${projectStatus.pulse ? "animate-pulse" : ""}`}
                />
              </span>
              <ChevronRightIcon className="absolute inset-0 m-auto size-3.5 opacity-0 transition-opacity duration-150 group-hover/project-header:opacity-100" />
            </span>
          ) : (
            <ChevronRightIcon
              className={`size-3.5 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
            />
          )}
        </span>
        <ProjectIcon project={project} />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="min-w-0 flex-1 truncate text-xs bg-transparent outline-none border border-ring rounded px-0.5"
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              onKeyDown={onRenameKeyDown}
              onBlur={onRenameSubmit}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span className="truncate text-xs font-medium text-foreground/90">{project.title}</span>
          )}
        </span>
      </SidebarMenuButton>

      <div className="pointer-events-none absolute top-1 right-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/project-header:pointer-events-auto group-hover/project-header:opacity-100">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Create new thread in ${project.title}`}
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
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
                aria-label={`Project actions for ${project.title}`}
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
                onClick={onOpenMenu}
              >
                <EllipsisIcon className="size-3.5" />
              </button>
            }
          />
          <TooltipPopup side="top">Project actions</TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
}
