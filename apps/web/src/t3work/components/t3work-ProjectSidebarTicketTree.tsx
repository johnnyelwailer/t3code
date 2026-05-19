import type { ProjectThread, ProjectTicket } from "~/t3work/t3work-types";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import {
  TicketSidebarEntry,
  type TicketSidebarEntryProps,
} from "./t3work-ProjectSidebarTicketEntry";

interface TicketTreeNodeProps extends Omit<
  TicketSidebarEntryProps,
  "ticketThreads" | "githubActivityItems"
> {
  ticket: ProjectTicket;
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
  ticketThreadsById: ReadonlyMap<string, readonly ProjectThread[]>;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  depth?: number;
}

export function TicketTreeNode({
  project,
  projectTickets,
  ticket,
  projectId,
  view,
  childrenByParentId,
  ticketThreadsById,
  githubActivityByWorkItem,
  showGitHubActivity,
  onSelectTicket,
  onCreateTicketThread,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
  depth = 0,
}: TicketTreeNodeProps) {
  const children = childrenByParentId.get(ticket.id) ?? [];
  return (
    <div className={depth > 0 ? "ml-2 border-l border-border/60 pl-2" : ""}>
      <TicketSidebarEntry
        project={project}
        projectTickets={projectTickets}
        ticket={ticket}
        projectId={projectId}
        view={view}
        ticketThreads={ticketThreadsById.get(ticket.id) ?? []}
        githubActivityItems={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
        showGitHubActivity={showGitHubActivity}
        onSelectTicket={onSelectTicket}
        onCreateTicketThread={onCreateTicketThread}
        onSelectThread={onSelectThread}
        onDeleteThread={onDeleteThread}
        onRenameThread={onRenameThread}
      />
      {children.length > 0 ? (
        <div className="mt-1 space-y-0.5">
          {children.map((child) => (
            <TicketTreeNode
              key={child.id}
              project={project}
              projectTickets={projectTickets}
              ticket={child}
              projectId={projectId}
              view={view}
              childrenByParentId={childrenByParentId}
              ticketThreadsById={ticketThreadsById}
              githubActivityByWorkItem={githubActivityByWorkItem}
              showGitHubActivity={showGitHubActivity}
              onSelectTicket={onSelectTicket}
              onCreateTicketThread={onCreateTicketThread}
              onSelectThread={onSelectThread}
              onDeleteThread={onDeleteThread}
              onRenameThread={onRenameThread}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
