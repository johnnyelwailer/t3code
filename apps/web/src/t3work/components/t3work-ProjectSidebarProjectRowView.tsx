import { ChevronRightIcon, SquarePenIcon } from "lucide-react";
import {
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "~/t3work/components/ui/t3work-sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3work/components/ui/t3work-tooltip";
import { ThreadRow } from "./t3work-ProjectSidebarThreadRow";
import { TicketSidebarEntry, TicketTreeNode } from "./t3work-ProjectSidebarTicketTree";
import { ProjectIcon } from "./t3work-ProjectIcon";
import type { ProjectRowProps } from "./t3work-projectSidebarProjectRowTypes";
import { useProjectSidebarProjectRow } from "./t3work-useProjectSidebarProjectRow";

export function ProjectSidebarProjectRowView(props: ProjectRowProps) {
  const state = useProjectSidebarProjectRow(props);
  const {
    project,
    expanded,
    projectStatus,
    view,
    ticketViewMode,
    onSelectThread,
    onSelectTicket,
    onCreateTicketThread,
    onDeleteThread,
    onRenameThread,
  } = props;

  return (
    <>
      <div className="group/project-header relative mb-1">
        <SidebarMenuButton
          size="sm"
          className="gap-2 px-2 py-1.5 pr-8 text-left hover:bg-accent group-hover/project-header:bg-accent group-hover/project-header:text-sidebar-accent-foreground max-sm:pr-14 cursor-pointer"
          onClick={state.handleProjectClick}
          onContextMenu={state.handleContextMenu}
        >
          {!expanded && projectStatus ? (
            <span
              aria-hidden
              title={projectStatus.label}
              className={`-ml-0.5 relative inline-flex size-3.5 shrink-0 items-center justify-center ${projectStatus.colorClass}`}
            >
              <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/project-header:opacity-0">
                <span
                  className={`size-[9px] rounded-full ${projectStatus.dotClass} ${projectStatus.pulse ? "animate-pulse" : ""}`}
                />
              </span>
              <ChevronRightIcon className="absolute inset-0 m-auto size-3.5 text-muted-foreground/70 opacity-0 transition-opacity duration-150 group-hover/project-header:opacity-100" />
            </span>
          ) : (
            <ChevronRightIcon
              className={`-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
            />
          )}
          <ProjectIcon project={project} />
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {state.isRenaming ? (
              <input
                ref={state.renameInputRef}
                className="min-w-0 flex-1 truncate text-xs bg-transparent outline-none border border-ring rounded px-0.5"
                value={state.renameTitle}
                onChange={(e) => state.setRenameTitle(e.target.value)}
                onKeyDown={state.handleRenameKeyDown}
                onBlur={state.handleRenameSubmit}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate text-xs font-medium text-foreground/90">
                {project.title}
              </span>
            )}
          </span>
        </SidebarMenuButton>

        <Tooltip>
          <TooltipTrigger
            render={
              <div className="pointer-events-none absolute top-1 right-1.5 opacity-0 transition-opacity duration-150 max-sm:pointer-events-auto max-sm:opacity-100 group-hover/project-header:pointer-events-auto group-hover/project-header:opacity-100">
                <button
                  type="button"
                  aria-label={`Create new thread in ${project.title}`}
                  className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
                  onClick={state.handleNewThread}
                >
                  <SquarePenIcon className="size-3.5" />
                </button>
              </div>
            }
          />
          <TooltipPopup side="top">New thread</TooltipPopup>
        </Tooltip>
      </div>

      {expanded && (
        <SidebarMenuSub className="mx-1 mt-1 mb-1.5 w-full translate-x-0 gap-0.5 overflow-hidden px-1.5 py-0.5">
          {state.visibleThreads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              isActive={view?.type === "thread" && view.threadId === thread.id}
              onSelect={() => onSelectThread(project.id, thread.id)}
              onDelete={() => onDeleteThread(thread.id)}
              onRename={(newTitle) => onRenameThread(thread.id, newTitle)}
            />
          ))}
          {state.hasOverflowingThreads && (
            <SidebarMenuSubItem className="w-full">
              <SidebarMenuSubButton
                size="sm"
                className="h-6 w-full translate-x-0 justify-start px-2 text-left text-[10px] text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80"
                onClick={() => state.setExpandedThreadList(!state.expandedThreadList)}
              >
                <span>{state.expandedThreadList ? "Show less" : "Show more"}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          )}
        </SidebarMenuSub>
      )}

      {expanded && props.projectTickets.length > 0 && (
        <SidebarMenuSub className="mx-1 mt-1.5 w-full translate-x-0 gap-0.5 overflow-hidden px-1.5 pb-0.5">
          {ticketViewMode === "tree"
            ? state.visibleTreeRoots.map((ticket) => (
                <SidebarMenuSubItem key={ticket.id} className="w-full">
                  <TicketTreeNode
                    ticket={ticket}
                    projectId={project.id}
                    view={view}
                    childrenByParentId={state.ticketHierarchy.childrenByParentId}
                    ticketThreadsById={state.ticketThreadsById}
                    githubActivityByWorkItem={state.githubActivityByWorkItem}
                    onSelectTicket={onSelectTicket}
                    onCreateTicketThread={onCreateTicketThread}
                    onSelectThread={onSelectThread}
                    onDeleteThread={onDeleteThread}
                    onRenameThread={onRenameThread}
                  />
                </SidebarMenuSubItem>
              ))
            : state.visibleFlatTickets.map((ticket) => (
                <SidebarMenuSubItem key={ticket.id} className="w-full">
                  <TicketSidebarEntry
                    ticket={ticket}
                    projectId={project.id}
                    view={view}
                    ticketThreads={state.ticketThreadsById.get(ticket.id) ?? []}
                    githubActivityItems={
                      state.githubActivityByWorkItem.get(ticket.ref.displayId) ?? []
                    }
                    onSelectTicket={onSelectTicket}
                    onCreateTicketThread={onCreateTicketThread}
                    onSelectThread={onSelectThread}
                    onDeleteThread={onDeleteThread}
                    onRenameThread={onRenameThread}
                  />
                </SidebarMenuSubItem>
              ))}

          {ticketViewMode === "tree" && state.visibleTreeUnresolvedChildren.length > 0 && (
            <div className="mt-1 space-y-1">
              <div className="px-2 text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/55">
                Unlinked
              </div>
              {state.visibleTreeUnresolvedChildren.map((ticket) => (
                <SidebarMenuSubItem key={ticket.id} className="w-full">
                  <TicketSidebarEntry
                    ticket={ticket}
                    projectId={project.id}
                    view={view}
                    ticketThreads={state.ticketThreadsById.get(ticket.id) ?? []}
                    githubActivityItems={
                      state.githubActivityByWorkItem.get(ticket.ref.displayId) ?? []
                    }
                    onSelectTicket={onSelectTicket}
                    onCreateTicketThread={onCreateTicketThread}
                    onSelectThread={onSelectThread}
                    onDeleteThread={onDeleteThread}
                    onRenameThread={onRenameThread}
                  />
                </SidebarMenuSubItem>
              ))}
            </div>
          )}

          {state.hiddenTicketCount > 0 && (
            <SidebarMenuSubItem>
              <SidebarMenuSubButton size="sm">
                <span className="text-[10px] text-muted-foreground/60">
                  +{state.hiddenTicketCount} more
                </span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          )}
        </SidebarMenuSub>
      )}
    </>
  );
}
