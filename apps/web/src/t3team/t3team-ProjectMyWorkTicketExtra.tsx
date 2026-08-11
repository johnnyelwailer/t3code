import { renderRelativeUpdatedAt } from "~/t3team/t3team-githubActivityViewUtils";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function ProjectMyWorkTicketExtra({
  ticket,
  compact = false,
}: {
  ticket: ProjectTicket;
  compact?: boolean;
}) {
  const updatedLabel = renderRelativeUpdatedAt(ticket.updatedAt);

  if (!updatedLabel) {
    return null;
  }

  return (
    <>
      {!compact && updatedLabel ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[10px] text-muted-foreground">Updated {updatedLabel}</span>
        </div>
      ) : null}
    </>
  );
}
