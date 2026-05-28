import type { ComponentProps } from "react";
import { ScrollArea } from "~/t3work/components/ui/t3work-scroll-area";
import { t3SurfaceBackdrops } from "~/t3work/components/ui/t3work-surface";
import { ResizableRightSidebarLayout } from "~/t3work/t3work-ResizableRightSidebarLayout";
import { getTicketRightSidebarCollapsedStorageKey } from "~/t3work/t3work-rightSidebarPersistence";
import {
  TicketDetailKickoffAside,
  type TicketDetailKickoffAsideProps,
} from "~/t3work/t3work-TicketDetailKickoffAside";
import { TicketDetailMainColumn } from "~/t3work/t3work-TicketDetailMainColumn";

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
      storageKey="t3work_ticket_right_sidebar"
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
