import type { ReactNode } from "react";

import { t3SurfaceBackdrops } from "~/t3team/components/ui/t3team-surface";
import { ResizableRightSidebarLayout } from "~/t3team/t3team-ResizableRightSidebarLayout";
import { getTicketRightSidebarCollapsedStorageKey } from "~/t3team/t3team-rightSidebarPersistence";
import {
  TicketDetailKickoffAside,
  type TicketDetailKickoffAsideProps,
} from "~/t3team/t3team-TicketDetailKickoffAside";

/**
 * Splits the detail view between the work item's content and the agent panel.
 *
 * The content column owns its own scrolling now — it needs to be the query container that the
 * responsive layout measures, so wrapping it in a scroll area here would put the scroll boundary on
 * the wrong element.
 */
export function TicketDetailBody({
  projectId,
  ticketId,
  activeThreadId,
  main,
  kickoffAsideProps,
}: {
  projectId: string;
  ticketId: string;
  activeThreadId: string | undefined;
  main: ReactNode;
  kickoffAsideProps: TicketDetailKickoffAsideProps;
}) {
  return (
    <ResizableRightSidebarLayout
      storageKey="t3team_ticket_right_sidebar"
      collapsedStorageKey={getTicketRightSidebarCollapsedStorageKey(
        activeThreadId
          ? {
              projectId,
              ticketId,
              embeddedThreadId: activeThreadId,
            }
          : {
              projectId,
              ticketId,
            },
      )}
      className={t3SurfaceBackdrops.ticketContent}
      minAsideWidth={22 * 16}
      defaultAsideWidth={24 * 16}
      mobileDefaultPanel={activeThreadId ? "aside" : "main"}
      mobileMainLabel="Details"
      mobileAsideLabel={activeThreadId ? "Chat" : "Agent"}
      main={
        <section
          className={`flex h-full min-h-0 flex-col border-b border-border ${t3SurfaceBackdrops.ticketMainColumn} lg:border-r lg:border-b-0`}
        >
          {main}
        </section>
      }
      aside={<TicketDetailKickoffAside {...kickoffAsideProps} />}
    />
  );
}
