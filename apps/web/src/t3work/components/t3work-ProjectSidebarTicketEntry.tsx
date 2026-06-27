/* oxlint-disable react/no-object-type-as-default-prop -- Existing merged lint debt; keep green while preserving behavior. */
import type { ProjectShellProject } from "@t3tools/project-context";
import { useMemo, type MouseEvent } from "react";

import { useTicketAgentContext } from "~/t3work/hooks/t3work-useTicketAgentContext";
import { T3WorkAgentContextDropOverlay } from "~/t3work/t3work-agentContextDrag";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { useAgentContext } from "~/t3work/hooks/t3work-useAgentContext";
import { buildTicketSidebarPinnedItemId } from "~/t3work/t3work-sidebarPinningTypes";
import { ProjectSidebarTicketCard } from "./t3work-ProjectSidebarTicketCard";
import { ThreadRow } from "./t3work-ProjectSidebarThreadRow";
import { ProjectSidebarTicketEntryGitHubActivity } from "./t3work-ProjectSidebarTicketEntryGitHubActivity";
import {
  getSidebarSurfaceClassName,
  getSidebarThreadState,
  getSidebarTicketState,
} from "./t3work-projectSidebarItemState";
import { buildProjectSidebarThreadTree } from "./t3work-projectSidebarThreadTree";
import { useProjectSidebarNavItemDnd } from "./t3work-useProjectSidebarNavItemDnd";
import { useAutoScrollIntoView } from "./t3work-useAutoScrollIntoView";
import { type ProjectThread, type ProjectTicket, type ViewState } from "~/t3work/t3work-types";

export interface TicketSidebarEntryProps {
  project: ProjectShellProject;
  projectTickets: ReadonlyArray<ProjectTicket>;
  ticket: ProjectTicket;
  projectId: string;
  view: ViewState | null;
  ticketThreads: readonly ProjectThread[];
  jiraLastCheckedAt?: number;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  githubActivityLastCheckedAt?: number;
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
  sidebarNavOrderScopeIds?: ReadonlyArray<string>;
}

export function TicketSidebarEntry({
  project,
  projectTickets,
  ticket,
  projectId,
  view,
  ticketThreads,
  jiraLastCheckedAt,
  githubActivityItems,
  githubActivityLastCheckedAt,
  showGitHubActivity,
  onSelectTicket,
  onCreateTicketThread,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
  sidebarNavOrderScopeIds = [],
}: TicketSidebarEntryProps) {
  const { runAgentContextAction } = useAgentContext();
  const githubActivityByWorkItem = useMemo(
    () =>
      new Map<string, readonly GitHubWorkActivityItem[]>([
        [ticket.ref.displayId, githubActivityItems],
      ]),
    [githubActivityItems, ticket.ref.displayId],
  );
  const {
    getTicketAgentContext,
    getGitHubActivityAgentContext,
    openTicketAgentContextMenu,
    openTicketAgentContextMenuAt,
    openGitHubActivityAgentContextMenu,
  } = useTicketAgentContext({
    project,
    projectTickets,
    githubActivityByWorkItem,
  });
  const ticketSidebarItemId = buildTicketSidebarPinnedItemId({ projectId, ticketId: ticket.id });
  const ticketAgentContext = getTicketAgentContext(ticket, { visibleInSidebar: true });
  const { dragProps, dropProps, isDropActive } = useProjectSidebarNavItemDnd({
    projectId,
    itemId: ticketSidebarItemId,
    label: `${ticket.ref.displayId} ${ticket.ref.title}`,
    capabilities: ticketAgentContext,
    scopeItemIds: sidebarNavOrderScopeIds,
  });

  const handleContextMenu = (event: MouseEvent) => {
    openTicketAgentContextMenu(event, ticket, { visibleInSidebar: true });
  };

  const handleOpenMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    openTicketAgentContextMenuAt(
      ticket,
      Math.round(rect.left + rect.width / 2),
      Math.round(rect.bottom),
      { visibleInSidebar: true },
    );
  };
  const ticketState = getSidebarTicketState({
    view,
    ticketId: ticket.id,
    ticketThreads,
  });
  const rowRef = useAutoScrollIntoView<HTMLAnchorElement>(ticketState.isOpen);
  const threadTree = useMemo(() => buildProjectSidebarThreadTree(ticketThreads), [ticketThreads]);
  const workspaceRoot = project.workspace?.rootPath ?? null;

  const renderThreadBranch = (thread: ProjectThread): React.ReactNode => {
    const childThreads = threadTree.childThreadsByParentId.get(thread.id) ?? [];
    const threadState = getSidebarThreadState({ view, threadId: thread.id });

    return (
      <div key={thread.id}>
        <ThreadRow
          thread={thread}
          variant="issue"
          state={threadState}
          workspacePath={workspaceRoot}
          onSelect={() => onSelectThread(projectId, thread.id)}
          onDelete={() => onDeleteThread(thread.id)}
          onRename={(newTitle) => onRenameThread(thread.id, newTitle)}
          wrapWithMenuItem={false}
        />
        {childThreads.length > 0 ? (
          <div className="mt-1 ml-2 space-y-1 pl-2">
            {childThreads.map((childThread) => renderThreadBranch(childThread))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className={`relative py-0.5 ${getSidebarSurfaceClassName(ticketState)}`}
      onContextMenu={handleContextMenu}
      draggable={dragProps.draggable}
      onDragStart={dragProps.onDragStart}
      onDragEnd={dragProps.onDragEnd}
      {...dropProps}
    >
      <T3WorkAgentContextDropOverlay
        active={isDropActive}
        label="Drop to move this work item"
        className="rounded-md"
      />
      <ProjectSidebarTicketCard
        ticket={ticket}
        state={ticketState}
        {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
        githubActivityItems={githubActivityItems}
        rowRef={rowRef}
        onSelectTicket={() => onSelectTicket(projectId, ticket.id)}
        onCreateThread={async (event) => {
          event.stopPropagation();
          const threadId = onCreateTicketThread({
            projectId,
            ticketId: ticket.id,
            ticketDisplayId: ticket.ref.displayId,
          });
          if (!ticketAgentContext) {
            return;
          }
          await runAgentContextAction(ticketAgentContext, "add-to-chat", {
            addToChatTarget: { type: "thread", threadId },
          });
        }}
        onOpenMenu={handleOpenMenu}
      />

      {threadTree.rootThreads.length > 0 ? (
        <div className="mt-1 ml-2 space-y-1 pl-2">
          {threadTree.rootThreads.map((thread) => renderThreadBranch(thread))}
        </div>
      ) : null}

      <ProjectSidebarTicketEntryGitHubActivity
        items={githubActivityItems}
        showGitHubActivity={showGitHubActivity}
        {...(githubActivityLastCheckedAt !== undefined
          ? { lastCheckedAt: githubActivityLastCheckedAt }
          : {})}
        onItemContextMenu={(event, item) => {
          openGitHubActivityAgentContextMenu(event, ticket, item, {
            visibleInSidebar: true,
          });
        }}
        getItemDragCapabilities={(item) =>
          getGitHubActivityAgentContext(ticket, item, {
            visibleInSidebar: true,
          })
        }
      />
    </div>
  );
}
