import type { ScopedThreadRef } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useRightPanelStore } from "~/rightPanelStore";
import { ScrollArea } from "~/t3team/components/ui/t3team-scroll-area";
import { DigestTicketAside } from "~/t3team/t3team-DigestTicketAside";
import { ProjectMyWorkDigestContent } from "~/t3team/t3team-ProjectMyWorkDigestContent";
import type { ProjectThread } from "~/t3team/t3team-types";
import type { T3TeamViewTarget } from "~/t3team/t3team-viewTarget";

const NO_PROJECT_THREADS: ProjectThread[] = [];
const IGNORE_EMBEDDED_THREAD = () => undefined;

function useOpenTicketPage() {
  const navigate = useNavigate();
  return (projectId: string, ticketId: string) =>
    void navigate({
      to: "/t3team/projects/$projectId/tickets/$ticketId",
      params: { projectId, ticketId },
    });
}

/** A row opens its ticket as another tab of the same panel, beside the chat it serves. */
export function MyWorkViewTab(props: {
  readonly threadRef: ScopedThreadRef;
  readonly project: ProjectShellProject;
}) {
  const { threadRef, project } = props;
  const openTicketPage = useOpenTicketPage();
  return (
    <ScrollArea className="h-full min-h-0">
      <div className="p-3">
        <ProjectMyWorkDigestContent
          project={project}
          onOpenTicket={openTicketPage}
          onSelectTicket={(ticket) =>
            useRightPanelStore
              .getState()
              .openView(threadRef, { kind: "work-item", projectId: project.id, ...ticket })
          }
        />
      </div>
    </ScrollArea>
  );
}

export function WorkItemViewTab(props: {
  readonly threadRef: ScopedThreadRef;
  readonly surfaceId: string;
  readonly target: Extract<T3TeamViewTarget, { kind: "work-item" }>;
  readonly project: ProjectShellProject;
}) {
  const { threadRef, surfaceId, target, project } = props;
  const openTicketPage = useOpenTicketPage();
  return (
    <DigestTicketAside
      key={target.ticketId}
      project={project}
      ticket={{
        projectId: project.id,
        ticketId: target.ticketId,
        openFullPage: (ticketId) => openTicketPage(project.id, ticketId),
      }}
      projectThreads={NO_PROJECT_THREADS}
      onRememberEmbeddedThread={IGNORE_EMBEDDED_THREAD}
      onOpenTicket={(ticketId) =>
        useRightPanelStore
          .getState()
          .openView(threadRef, { kind: "work-item", projectId: project.id, ticketId })
      }
      onClose={() => useRightPanelStore.getState().closeSurface(threadRef, surfaceId)}
    />
  );
}

export function ViewTabMessage({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
