import type { ProjectShellProject } from "@t3tools/project-context";
import { ExternalLink, Maximize2, MessageSquarePlus, XIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { useAgentContext } from "~/t3team/hooks/t3team-useAgentContext";
import { useWorkItemDetailViewModel } from "~/t3team/hooks/t3team-useWorkItemDetailViewModel";
import { useDigestTicketChatActions } from "~/t3team/t3team-digestTicketChatContext";
import { DigestTicketAsideChat } from "~/t3team/t3team-DigestTicketAsideChat";
import { ToggleGroup } from "~/t3team/t3team-ToggleGroup";
import { latestLiveTicketThreadId } from "~/t3team/t3team-ticketLookup";
import type { ProjectThread } from "~/t3team/t3team-types";
import { buildWorkItemDetailMainProps } from "~/t3team/workitem/t3team-buildWorkItemDetailMainProps";
import { WorkItemBreadcrumb } from "~/t3team/workitem/t3team-WorkItemBreadcrumb";
import { WorkItemDetailMain } from "~/t3team/workitem/t3team-WorkItemDetailMain";

import {
  closeDigestPullRequest,
  openDigestTicket,
  type DigestAsideTicket,
} from "./t3team-digestPrAsideStore";

/**
 * A ticket a digest row opened, beside the digest: the work item's own detail column (the one the
 * ticket page renders, from the same view model), under a slim bar that says where you are and
 * offers the full page, Jira, and close. A parent or child clicked inside replaces it here.
 */
export function DigestTicketAside({
  project,
  ticket,
  projectThreads,
  onRememberEmbeddedThread,
}: {
  project: ProjectShellProject;
  ticket: DigestAsideTicket;
  projectThreads: ProjectThread[];
  onRememberEmbeddedThread: (threadId: string) => void;
}) {
  const { showAgentContextMenu } = useAgentContext();
  const chatActions = useDigestTicketChatActions();
  // Details first; Chat is the ticket page's own agent panel, with this ticket as its context.
  const [tab, setTab] = useState<"details" | "chat">("details");
  // The ticket's live thread is its chat here, as on the ticket page: the Chat tab shows it, and the
  // view model attaches the ticket's context to it. A thread started from the tab becomes it.
  const liveThreadId = useMemo(
    () => latestLiveTicketThreadId(projectThreads, ticket.ticketId),
    [projectThreads, ticket.ticketId],
  );
  // "New chat" steps away from the live thread: the composer shows until a newer thread exists.
  const [setAsideThreadId, setSetAsideThreadId] = useState<string | undefined>(undefined);
  const ticketThreadId = liveThreadId === setAsideThreadId ? undefined : liveThreadId;
  const view = useWorkItemDetailViewModel({
    project,
    ticketId: ticket.ticketId,
    // Only on the Chat tab: binding a thread also marks it embedded, which reading Details must not.
    ...(tab === "chat" && ticketThreadId !== undefined ? { activeThreadId: ticketThreadId } : {}),
    projectThreads,
    onRememberEmbeddedThread,
  });
  const openTicket = useCallback(
    (ticketId: string) =>
      openDigestTicket({
        projectId: project.id,
        ticketId,
        ...(ticket.openFullPage ? { openFullPage: ticket.openFullPage } : {}),
      }),
    [project.id, ticket.openFullPage],
  );
  return (
    <div className="@container/workitem-header flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border/60 px-2">
        <WorkItemBreadcrumb
          projectTitle={project.title}
          itemKey={view.displayId}
          {...(view.fieldModel.parent ? { parent: view.fieldModel.parent } : {})}
          onOpenParent={openTicket}
          className="min-w-0 flex-1"
        />
        {chatActions ? (
          <ToggleGroup
            value={tab}
            onChange={(value) => setTab(value === "chat" ? "chat" : "details")}
            options={[
              { value: "details", label: "Details" },
              { value: "chat", label: "Chat" },
            ]}
          />
        ) : null}
        {chatActions && tab === "chat" && ticketThreadId !== undefined ? (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => setSetAsideThreadId(ticketThreadId)}
            aria-label="New chat"
            title="New chat"
          >
            <MessageSquarePlus className="size-3.5" />
          </Button>
        ) : null}
        {ticket.openFullPage ? (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => ticket.openFullPage?.(ticket.ticketId)}
            aria-label="Open full page"
            title="Open full page"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        ) : null}
        {view.ticketUrl ? (
          <Button
            size="icon-xs"
            variant="ghost"
            render={<a href={view.ticketUrl} target="_blank" rel="noreferrer" />}
            aria-label="Open in Jira"
            title="Open in Jira"
          >
            <ExternalLink className="size-3.5" />
          </Button>
        ) : null}
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={closeDigestPullRequest}
          aria-label="Close"
          title="Close"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      {/* A flex column, as on the ticket page: the detail layout's own scroll area fills it and
          scrolls, instead of growing with its content and being clipped. */}
      {chatActions && tab === "chat" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DigestTicketAsideChat project={project} view={view} actions={chatActions} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <WorkItemDetailMain
            {...buildWorkItemDetailMainProps({
              view,
              project,
              onOpenTicket: openTicket,
              showAgentContextMenu,
            })}
          />
        </div>
      )}
    </div>
  );
}
