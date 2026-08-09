import { ChevronUp, ChevronsUp, Equal } from "lucide-react";

import { cn } from "~/t3team/lib/t3team-utils";
import {
  resolveWorkItemPriorityTone,
  workItemPriorityClassName,
  workItemPriorityIsDoubled,
  workItemPriorityPointsDown,
} from "~/t3team/workitem/t3team-workItemFieldTokens";

/**
 * Priority as direction plus urgency.
 *
 * Jira serves a priority icon URL per site, but those are raster images in Atlassian's palette that
 * cannot follow a workspace theme and sit badly next to our own iconography. Deriving the glyph
 * from the priority name keeps it themable, and encoding rank as orientation as well as colour
 * means the signal survives colour-blind viewing and greyscale printing.
 */
export function WorkItemPriorityIcon({
  priority,
  className,
}: {
  readonly priority: string | undefined;
  readonly className?: string;
}) {
  const tone = resolveWorkItemPriorityTone(priority);
  if (!tone) return null;

  const Glyph =
    tone === "medium" ? Equal : workItemPriorityIsDoubled(tone) ? ChevronsUp : ChevronUp;

  return (
    <Glyph
      aria-hidden="true"
      className={cn(
        "size-3.5 shrink-0",
        workItemPriorityClassName[tone],
        workItemPriorityPointsDown(tone) && "rotate-180",
        className,
      )}
    />
  );
}

/** Priority icon plus its name, for the properties rail and the title band. */
export function WorkItemPriorityChip({
  priority,
  className,
}: {
  readonly priority: string | undefined;
  readonly className?: string;
}) {
  if (!priority) return null;

  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <WorkItemPriorityIcon priority={priority} />
      <span className="truncate text-xs text-foreground">{priority}</span>
    </span>
  );
}
