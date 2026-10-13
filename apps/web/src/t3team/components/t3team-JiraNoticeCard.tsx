import { Info } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { T3SurfaceCard } from "~/t3team/components/ui/t3team-surface";

/**
 * The muted one-line notice the Jira surfaces share: a bold lead, a muted reason and one action.
 */
export function JiraNoticeCard({
  lead,
  detail,
  actionLabel,
  onAction,
}: {
  readonly lead: string;
  readonly detail: string;
  readonly actionLabel: string;
  readonly onAction: () => void;
}) {
  return (
    <T3SurfaceCard role="status" tone="muted">
      <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 p-2.5">
        <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-xs leading-5 text-foreground">
          <span className="font-medium">{lead}</span>{" "}
          <span className="text-muted-foreground">{detail}</span>
        </p>
        <Button type="button" size="xs" variant="outline" className="shrink-0" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </T3SurfaceCard>
  );
}
