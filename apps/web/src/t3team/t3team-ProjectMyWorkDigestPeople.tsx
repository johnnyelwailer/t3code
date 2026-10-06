import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemPersonAvatar } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";

type PersonSlot = {
  readonly role: string;
  readonly name: string;
  readonly avatarUrl?: string;
};

/**
 * The people a ticket is about, as small avatars in the row's right cluster: the assignee
 * always, plus the reporter for bugs (who hit the problem). Names live in the tooltip only —
 * the avatar carries the identity. The viewer is left out: in My Work their own face says nothing.
 */
export function DigestPeoplePills({
  ticket,
  viewerName,
}: {
  ticket: ProjectTicket;
  viewerName: string;
}) {
  const slots: PersonSlot[] = [];
  if (ticket.assignee && ticket.assignee !== viewerName)
    slots.push({
      role: "Assignee",
      name: ticket.assignee,
      ...(ticket.assigneeAvatarUrl ? { avatarUrl: ticket.assigneeAvatarUrl } : {}),
    });
  if (
    ticket.issueType?.toLowerCase() === "bug" &&
    ticket.reporter &&
    ticket.reporter !== ticket.assignee &&
    ticket.reporter !== viewerName
  ) {
    slots.push({
      role: "Reporter",
      name: ticket.reporter,
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
                  person={{
                    displayName: slot.name,
                    ...(slot.avatarUrl ? { avatarUrl: slot.avatarUrl } : {}),
                  }}
                  size="sm"
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
