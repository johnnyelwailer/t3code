import { Badge } from "~/t3team/components/ui/t3team-badge";
import { cn } from "~/t3team/lib/t3team-utils";
import type { WorkItemStatus } from "~/t3team/workitem/t3team-workItemFieldModel";
import {
  resolveWorkItemStatusTone,
  workItemStatusBadgeVariant,
  workItemStatusDotClassName,
} from "~/t3team/workitem/t3team-workItemFieldTokens";

/**
 * Status as Jira names it, toned by its status category.
 *
 * The badge shows the workflow's own status name rather than the category — "In Review" is more
 * useful than "In Progress" — while the colour comes from the category, which is the only part
 * Jira guarantees to be consistent across projects.
 */
export function WorkItemStatusBadge({
  status,
  className,
}: {
  readonly status: WorkItemStatus | undefined;
  readonly className?: string;
}) {
  if (!status) return null;

  const tone = resolveWorkItemStatusTone({
    ...(status.categoryKey !== undefined ? { statusCategoryKey: status.categoryKey } : {}),
    statusName: status.name,
  });

  return (
    <Badge variant={workItemStatusBadgeVariant(tone)} className={cn("gap-1.5", className)}>
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", workItemStatusDotClassName[tone])}
      />
      {status.name}
    </Badge>
  );
}
