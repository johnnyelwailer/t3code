import { AlertTriangleIcon } from "lucide-react";

import type { JiraCatalogSiteFailure } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** A Jira site whose project list failed: same disc as the row, with a retry. */
export function T3TeamSidebarProjectScopeSiteFailure({
  failure,
  onRetry,
}: {
  failure: JiraCatalogSiteFailure;
  onRetry: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`Retry ${failure.label}`}
            onClick={onRetry}
            className="inline-flex h-7 max-w-36 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-destructive/40 bg-card px-1.5 text-xs font-medium text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/60 dark:bg-sidebar-control-surface"
          />
        }
      >
        <AlertTriangleIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{failure.label}</span>
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {failure.label} could not be loaded. {failure.error}
      </TooltipPopup>
    </Tooltip>
  );
}
