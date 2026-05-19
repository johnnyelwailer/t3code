import { EllipsisIcon, SquarePenIcon } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { MouseEvent } from "react";

import { SidebarMenuSubButton } from "~/t3work/components/ui/t3work-sidebar";
import { JiraIssueTypeIcon } from "~/t3work/components/ticket/t3work-JiraIssueType";
import { useBackend } from "~/t3work/backend/t3work-index";
import { buildComprehensiveTicketPayload } from "~/t3work/t3work-addToChatPayloadBuilders";
import { GitHubActivityInlineList } from "~/t3work/t3work-GitHubActivityViews";
import {
  buildGitHubActivityContextBundle,
  buildGitHubActivityDisplay,
} from "~/t3work/t3work-githubActivityContextPayload";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { useAddToChat } from "~/t3work/hooks/t3work-useAddToChat";
import { ThreadRow } from "./t3work-ProjectSidebarThreadRow";
import { buildTicketSidebarAddToChatRequest } from "./t3work-projectSidebarAddToChatRequests";
import type { ProjectThread, ProjectTicket, ViewState } from "~/t3work/t3work-types";
import { readLocalApi } from "~/localApi";

export interface TicketSidebarEntryProps {
  project: ProjectShellProject;
  projectTickets: ReadonlyArray<ProjectTicket>;
  ticket: ProjectTicket;
  projectId: string;
  view: ViewState | null;
  ticketThreads: readonly ProjectThread[];
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  showGitHubActivity: boolean;
  onSelectTicket: (projectId: string, ticketId: string) => void;
  onCreateTicketThread: (input: {
    projectId: string;
    ticketId: string;
    ticketDisplayId: string;
  }) => string;
  onSelectThread: (projectId: string, threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
}

export function TicketSidebarEntry({
  project,
  projectTickets,
  ticket,
  projectId,
  view,
  ticketThreads,
  githubActivityItems,
  showGitHubActivity,
  onSelectTicket,
  onCreateTicketThread,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
}: TicketSidebarEntryProps) {
  const backend = useBackend();
  const { addToChatFromRequest, showAddToChatContextMenu } = useAddToChat();
  const buildAddToChatRequest = (backendApi: NonNullable<typeof backend>) =>
    buildTicketSidebarAddToChatRequest({
      backend: backendApi,
      project,
      projectId,
      projectTickets,
      ticket,
      githubActivityItems,
    });

  const openTicketMenuAt = async (x: number, y: number) => {
    const localApi = readLocalApi();
    if (!localApi || !backend) return;
    const action = await localApi.contextMenu.show([{ id: "add-to-chat", label: "Add to chat" }], {
      x,
      y,
    });
    if (action !== "add-to-chat") return;
    await addToChatFromRequest(buildAddToChatRequest(backend));
  };

  const handleContextMenu = (event: MouseEvent) => {
    if (!backend) return;
    void showAddToChatContextMenu(event, buildAddToChatRequest(backend));
  };

  const handleOpenMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    void openTicketMenuAt(Math.round(rect.left + rect.width / 2), Math.round(rect.bottom));
  };

  return (
    <div
      className="group/ticket rounded-md bg-background/25 px-1 py-0.5"
      onContextMenu={handleContextMenu}
    >
      <div className="relative">
        <SidebarMenuSubButton
          size="sm"
          isActive={view?.type === "ticket" && view.ticketId === ticket.id}
          className="h-auto min-h-8 w-full flex-col items-start py-1"
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
          <div className="w-full truncate text-[10px] leading-tight text-muted-foreground/70">
            {ticket.ref.title}
          </div>
        </SidebarMenuSubButton>

        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-start opacity-0 transition-opacity duration-150 group-hover/ticket:pointer-events-auto group-hover/ticket:opacity-100">
          <div className="h-full w-6 bg-gradient-to-r from-transparent to-card" />
          <div className="flex items-center gap-1 bg-card pt-1">
            <button
              type="button"
              aria-label={`Create new thread for ${ticket.ref.displayId}`}
              className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-foreground"
              onClick={async (e) => {
                e.stopPropagation();
                const threadId = onCreateTicketThread({
                  projectId,
                  ticketId: ticket.id,
                  ticketDisplayId: ticket.ref.displayId,
                });
                if (!backend) return;
                await addToChatFromRequest(buildAddToChatRequest(backend), {
                  type: "thread",
                  threadId,
                });
              }}
            >
              <SquarePenIcon className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Issue actions for ${ticket.ref.displayId}`}
              className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-foreground"
              onClick={handleOpenMenu}
            >
              <EllipsisIcon className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {ticketThreads.length > 0 ? (
        <div className="mt-1 ml-2 space-y-1 pl-2">
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

      {showGitHubActivity && githubActivityItems.length > 0 ? (
        <div className="mt-0.5">
          <GitHubActivityInlineList
            items={githubActivityItems}
            limit={2}
            compact
            onItemContextMenu={(event, item) => {
              const display = buildGitHubActivityDisplay({ item });
              void showAddToChatContextMenu(event, {
                projectId,
                projectTitle: project.title,
                projectWorkspaceRoot: project.workspace?.rootPath,
                targetLabel: display.targetLabel,
                targetType: display.targetType,
                kind: display.activityKind,
                dedupeKey: `${projectId}:github-activity:${item.id}`,
                summaryItems: display.summaryItems,
                payload: async () => {
                  const linkedTicketContext = backend
                    ? await buildComprehensiveTicketPayload({
                        backend,
                        project,
                        ticket,
                        projectTickets,
                        githubActivityItems,
                      })
                    : undefined;
                  return buildGitHubActivityContextBundle({
                    project,
                    item,
                    linkedWorkItem: ticket,
                    ...(linkedTicketContext ? { linkedTicketContext } : {}),
                  });
                },
              });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
