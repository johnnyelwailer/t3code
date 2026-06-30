import { InboxIcon, RefreshCwIcon, SearchXIcon } from "lucide-react";

import { Button } from "~/t3work/components/ui/t3work-button";
import { T3SurfacePanel } from "~/t3work/components/ui/t3work-surface";

export function ProjectMyWorkEmptyState({
  reason,
  onRefresh,
  onClearFilters,
}: {
  reason: "no-assigned" | "filtered";
  onRefresh?: () => void;
  onClearFilters?: () => void;
}) {
  const isFiltered = reason === "filtered";
  const Icon = isFiltered ? SearchXIcon : InboxIcon;
  const ActionIcon = isFiltered ? SearchXIcon : RefreshCwIcon;
  const title = isFiltered ? "No matching work" : "No work assigned to you";
  const description = isFiltered
    ? "No assigned issues match your current search and filters."
    : "Nothing in this project is assigned to you yet. New Jira issues appear here automatically once they are.";
  const actionLabel = isFiltered ? "Clear filters" : "Refresh";
  const onAction = isFiltered ? onClearFilters : onRefresh;

  return (
    <T3SurfacePanel
      tone="dashed"
      className="flex flex-col items-center gap-3 px-4 py-10 text-center"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {onAction ? (
        <Button variant="outline" size="sm" onClick={onAction}>
          <ActionIcon className="size-3.5" aria-hidden />
          {actionLabel}
        </Button>
      ) : null}
    </T3SurfacePanel>
  );
}
