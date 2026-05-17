import { SquarePenIcon } from "lucide-react";
import type { ProjectThread, ProjectTicket, ViewState } from "~/t3work/t3work-types";
import { SidebarMenuSubButton } from "~/t3work/components/ui/t3work-sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3work/components/ui/t3work-tooltip";
import { JiraIssueTypeIcon } from "~/t3work/components/ticket/t3work-JiraIssueType";
import { ThreadRow } from "./t3work-ProjectSidebarThreadRow";

interface TicketSidebarEntryProps {
  ticket: ProjectTicket;
  projectId: string;
  view: ViewState | null;
  ticketThreads: readonly ProjectThread[];
  onSelectTicket: (projectId: string, ticketId: string) => void;
  onCreateTicketThread: (input: {
    projectId: string;
    ticketId: string;
    ticketDisplayId: string;
  }) => void;
  onSelectThread: (projectId: string, threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
}

export function TicketSidebarEntry({
  ticket,
  projectId,
  view,
  ticketThreads,
  onSelectTicket,
  onCreateTicketThread,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
}: TicketSidebarEntryProps) {
  return (
    <div className="group/ticket rounded-md border border-border/60 bg-background/45 p-1">
      <div className="flex items-start gap-1">
        <SidebarMenuSubButton
          size="sm"
          isActive={view?.type === "ticket" && view.ticketId === ticket.id}
          className="h-auto min-h-9 flex-1 flex-col items-start py-1.5"
          onClick={() => onSelectTicket(projectId, ticket.id)}
        >
          <div className="flex w-full items-center gap-1">
            <JiraIssueTypeIcon
              issueType={ticket.issueType}
              issueTypeIconUrl={ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl}
            />
            <span className="truncate text-[11px] font-medium">{ticket.ref.displayId}</span>
            <span className="ml-1 text-[10px] text-muted-foreground/75">{ticket.status}</span>
          </div>
          <div className="mt-0.5 w-full truncate text-[10px] text-muted-foreground/70">
            {ticket.ref.title}
          </div>
        </SidebarMenuSubButton>

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Create new thread for ${ticket.ref.displayId}`}
                className="mt-0.5 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-colors transition-opacity duration-150 pointer-events-none group-hover/ticket:pointer-events-auto group-hover/ticket:opacity-100 hover:bg-accent hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateTicketThread({
                    projectId,
                    ticketId: ticket.id,
                    ticketDisplayId: ticket.ref.displayId,
                  });
                }}
              />
            }
          >
            <SquarePenIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup side="right">New thread for this issue</TooltipPopup>
        </Tooltip>
      </div>

      {ticketThreads.length > 0 ? (
        <div className="mt-1.5 ml-2 space-y-1 border-l border-border/70 pl-2">
          {ticketThreads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              variant="issue"
              isActive={view?.type === "thread" && view.threadId === thread.id}
              onSelect={() => onSelectThread(projectId, thread.id)}
              onDelete={() => onDeleteThread(thread.id)}
              onRename={(newTitle) => onRenameThread(thread.id, newTitle)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface TicketTreeNodeProps extends Omit<TicketSidebarEntryProps, "ticketThreads"> {
  ticket: ProjectTicket;
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
  ticketThreadsById: ReadonlyMap<string, readonly ProjectThread[]>;
  depth?: number;
}

export function TicketTreeNode({
  ticket,
  projectId,
  view,
  childrenByParentId,
  ticketThreadsById,
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
        ticket={ticket}
        projectId={projectId}
        view={view}
        ticketThreads={ticketThreadsById.get(ticket.id) ?? []}
        onSelectTicket={onSelectTicket}
        onCreateTicketThread={onCreateTicketThread}
        onSelectThread={onSelectThread}
        onDeleteThread={onDeleteThread}
        onRenameThread={onRenameThread}
      />
      {children.length > 0 ? (
        <div className="mt-1.5 space-y-1">
          {children.map((child) => (
            <TicketTreeNode
              key={child.id}
              ticket={child}
              projectId={projectId}
              view={view}
              childrenByParentId={childrenByParentId}
              ticketThreadsById={ticketThreadsById}
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
