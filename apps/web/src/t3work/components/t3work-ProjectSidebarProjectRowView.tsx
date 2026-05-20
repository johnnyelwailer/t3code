import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "~/t3work/components/ui/t3work-sidebar";
import { ProjectSidebarProjectHeader } from "./t3work-ProjectSidebarProjectHeader";
import { ThreadRow } from "./t3work-ProjectSidebarThreadRow";
import { TicketSidebarEntry } from "./t3work-ProjectSidebarTicketEntry";
import { TicketTreeNode } from "./t3work-ProjectSidebarTicketTree";
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
    showProjectThreads,
    showJiraItems,
    showGitHubActivity,
    onSelectThread,
    onSelectTicket,
    onCreateTicketThread,
    onDeleteThread,
    onRenameThread,
  } = props;

  return (
    <>
      <ProjectSidebarProjectHeader
        project={project}
        expanded={expanded}
        projectStatus={projectStatus}
        isRenaming={state.isRenaming}
        renameInputRef={state.renameInputRef}
        renameTitle={state.renameTitle}
        setRenameTitle={state.setRenameTitle}
        onProjectClick={state.handleProjectClick}
        onContextMenu={state.handleContextMenu}
        onToggleExpand={state.handleToggleExpand}
        onRenameKeyDown={state.handleRenameKeyDown}
        onRenameSubmit={state.handleRenameSubmit}
        onNewThread={state.handleNewThread}
        onOpenMenu={state.handleOpenMenu}
      />

      {expanded && showProjectThreads && (
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

      {expanded && showJiraItems && props.projectTickets.length > 0 && (
        <SidebarMenuSub className="mx-1 mt-1.5 w-full translate-x-0 gap-0.5 overflow-hidden px-1.5 pb-0.5">
          {ticketViewMode === "tree"
            ? state.visibleTreeRoots.map((ticket) => (
                <SidebarMenuSubItem key={ticket.id} className="w-full">
                  <TicketTreeNode
                    project={project}
                    projectTickets={props.projectTickets}
                    ticket={ticket}
                    projectId={project.id}
                    view={view}
                    childrenByParentId={state.ticketHierarchy.childrenByParentId}
                    ticketThreadsById={state.ticketThreadsById}
                    githubActivityByWorkItem={state.githubActivityByWorkItem}
                    {...(props.jiraLastCheckedAt !== undefined
                      ? { jiraLastCheckedAt: props.jiraLastCheckedAt }
                      : {})}
                    {...(state.githubActivityLastCheckedAt !== undefined
                      ? { githubActivityLastCheckedAt: state.githubActivityLastCheckedAt }
                      : {})}
                    showGitHubActivity={showGitHubActivity}
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
                    project={project}
                    projectTickets={props.projectTickets}
                    ticket={ticket}
                    projectId={project.id}
                    view={view}
                    ticketThreads={state.ticketThreadsById.get(ticket.id) ?? []}
                    {...(props.jiraLastCheckedAt !== undefined
                      ? { jiraLastCheckedAt: props.jiraLastCheckedAt }
                      : {})}
                    githubActivityItems={
                      state.githubActivityByWorkItem.get(ticket.ref.displayId) ?? []
                    }
                    {...(state.githubActivityLastCheckedAt !== undefined
                      ? { githubActivityLastCheckedAt: state.githubActivityLastCheckedAt }
                      : {})}
                    showGitHubActivity={showGitHubActivity}
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
                    project={project}
                    projectTickets={props.projectTickets}
                    ticket={ticket}
                    projectId={project.id}
                    view={view}
                    ticketThreads={state.ticketThreadsById.get(ticket.id) ?? []}
                    {...(props.jiraLastCheckedAt !== undefined
                      ? { jiraLastCheckedAt: props.jiraLastCheckedAt }
                      : {})}
                    githubActivityItems={
                      state.githubActivityByWorkItem.get(ticket.ref.displayId) ?? []
                    }
                    {...(state.githubActivityLastCheckedAt !== undefined
                      ? { githubActivityLastCheckedAt: state.githubActivityLastCheckedAt }
                      : {})}
                    showGitHubActivity={showGitHubActivity}
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
              <div className="px-2 py-1 text-[10px] text-muted-foreground/60">
                +{state.hiddenTicketCount} more
              </div>
            </SidebarMenuSubItem>
          )}
        </SidebarMenuSub>
      )}
    </>
  );
}
