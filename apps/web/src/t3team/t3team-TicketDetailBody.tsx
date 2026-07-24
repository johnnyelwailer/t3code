import type { ComponentProps } from "react";
import { ScrollArea } from "~/t3team/components/ui/t3team-scroll-area";
import { t3SurfaceBackdrops } from "~/t3team/components/ui/t3team-surface";
import { ResizableRightSidebarLayout } from "~/t3team/t3team-ResizableRightSidebarLayout";
import { getTicketRightSidebarCollapsedStorageKey } from "~/t3team/t3team-rightSidebarPersistence";
import {
  TicketDetailKickoffAside,
  type TicketDetailKickoffAsideProps,
} from "~/t3team/t3team-TicketDetailKickoffAside";
import { TicketDetailMainColumn } from "~/t3team/t3team-TicketDetailMainColumn";

export function TicketDetailBody({
  projectId,
  ticketId,
  activeThreadId,
  mainColumnProps,
  kickoffAsideProps,
}: {
  projectId: string;
  ticketId: string;
  activeThreadId: string | undefined;
  mainColumnProps: ComponentProps<typeof TicketDetailMainColumn>;
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
          <ScrollArea className="h-full">
            <TicketDetailMainColumn {...mainColumnProps} />
          </ScrollArea>
        </section>
      }
      aside={<TicketDetailKickoffAside {...kickoffAsideProps} />}
    />
  );
}
