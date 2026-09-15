import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemPersonAvatar } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";

type PersonSlot = { readonly role: string; readonly name: string; readonly isViewer: boolean };

/**
 * The people a ticket is about, as small avatars in the row's right cluster: the assignee
 * always, plus the reporter for bugs (who hit the problem). Names live in the tooltip only —
 * the avatar's initials carry the identity. The viewer's own avatar gets the current-user ring.
 */
export function DigestPeoplePills({
  ticket,
  viewerName,
}: {
  ticket: ProjectTicket;
  viewerName: string;
}) {
  const slots: PersonSlot[] = [];
  if (ticket.assignee)
    slots.push({
      role: "Assignee",
      name: ticket.assignee,
      isViewer: ticket.assignee === viewerName,
    });
  if (
    ticket.issueType?.toLowerCase() === "bug" &&
    ticket.reporter &&
    ticket.reporter !== ticket.assignee
  ) {
    slots.push({
      role: "Reporter",
      name: ticket.reporter,
      isViewer: ticket.reporter === viewerName,
    });
  }
  if (slots.length === 0) return null;
  return (
    <span className="flex items-center gap-0.5">
      {slots.map((slot) => (
        <Tooltip key={`${slot.role}-${slot.name}`}>
          <TooltipTrigger
            render={
              <span aria-label={`${slot.role}: ${slot.name}`}>
                <WorkItemPersonAvatar
                  person={{ displayName: slot.name }}
                  size="sm"
                  isCurrentUser={slot.isViewer}
                />
              </span>
            }
          />
          <TooltipPopup side="top">
            {slot.role}: {slot.name}
          </TooltipPopup>
        </Tooltip>
      ))}
    </span>
  );
}
