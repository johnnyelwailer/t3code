import { LinkExternalIcon, MarkGithubIcon } from "@primer/octicons-react";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "~/t3work/components/ui/t3work-skeleton";
import { T3SurfacePanel } from "~/t3work/components/ui/t3work-surface";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3work/components/ui/t3work-tooltip";
import { useT3WorkAgentContextDrag } from "~/t3work/t3work-agentContextDrag";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { GitHubActivityTooltipContent } from "~/t3work/t3work-GitHubActivityTooltipContent";
import type { AgentContextCapabilities } from "~/t3work/t3work-agentContext";
import {
  getGitHubActivityVisual,
  isActiveReviewRequested,
  isRedundantPullRequestReason,
  renderRelativeUpdatedAt,
} from "~/t3work/t3work-githubActivityViewUtils";

function formatReason(reason: string): string {
  return reason.replaceAll("_", " ");
}

function GitHubActivitySectionRow({
  item,
  lastCheckedAt,
  onItemContextMenu,
  getItemDragCapabilities,
}: {
  item: GitHubWorkActivityItem;
  lastCheckedAt?: number;
  onItemContextMenu?: (event: React.MouseEvent, item: GitHubWorkActivityItem) => void;
  getItemDragCapabilities?: (item: GitHubWorkActivityItem) => AgentContextCapabilities;
}) {
  const dragProps = useT3WorkAgentContextDrag({
    capabilities: getItemDragCapabilities?.(item) ?? null,
    label: item.subjectTitle ?? item.repository,
  });
  const visual = getGitHubActivityVisual(item);
  const updatedAt = renderRelativeUpdatedAt(item.updatedAt);
  const linkTarget = item.subjectUrl ?? item.repositoryUrl;
  const summaryLabel = isActiveReviewRequested(item)
    ? "Review requested"
    : !isRedundantPullRequestReason(item)
      ? formatReason(item.reason)
      : undefined;
  const rowContent = (
    <>
      <visual.Icon className={`mt-0.5 size-3.5 shrink-0 ${visual.iconClassName}`} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-foreground/90">
          {item.subjectTitle ?? item.repository}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {summaryLabel ? <span>{summaryLabel}</span> : null}
          {updatedAt ? <span>{updatedAt}</span> : null}
        </div>
      </div>
      {linkTarget ? (
        <LinkExternalIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
      ) : null}
    </>
  );

  return (
    <div className="rounded border border-border/70 bg-background/70">
      <Tooltip>
        <TooltipTrigger
          render={
            linkTarget ? (
              <a
                href={linkTarget}
                target="_blank"
                rel="noreferrer"
                draggable={dragProps.draggable}
                className="relative z-10 flex cursor-pointer items-start gap-2 px-2 py-1.5 transition-colors hover:bg-accent/35"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => onItemContextMenu?.(event, item)}
                onDragStart={dragProps.onDragStart}
                onDragEnd={dragProps.onDragEnd}
              />
            ) : (
              <div
                draggable={dragProps.draggable}
                className="flex items-start gap-2 px-2 py-1.5"
                onContextMenu={(event) => onItemContextMenu?.(event, item)}
                onDragStart={dragProps.onDragStart}
                onDragEnd={dragProps.onDragEnd}
              />
            )
          }
        >
          {rowContent}
        </TooltipTrigger>
        <TooltipPopup side="top" align="start" className="max-w-96">
          <GitHubActivityTooltipContent
            item={item}
            {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
          />
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

export function GitHubActivitySection({
  title,
  items,
  warning,
  suggestedRepositoryCount,
  host,
  account,
  loading,
  lastCheckedAt,
  onItemContextMenu,
  getItemDragCapabilities,
}: {
  title: string;
  items: ReadonlyArray<GitHubWorkActivityItem>;
  warning?: string;
  suggestedRepositoryCount?: number;
  host?: string;
  account?: string;
  loading?: boolean;
  lastCheckedAt?: number;
  onItemContextMenu?: (event: React.MouseEvent, item: GitHubWorkActivityItem) => void;
  getItemDragCapabilities?: (item: GitHubWorkActivityItem) => AgentContextCapabilities;
}) {
  return (
    <T3SurfacePanel tone="muted" className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="text-[11px] text-muted-foreground">
          {host ? <span>{host}</span> : null}
          {account ? <span> · {account}</span> : null}
        </div>
      </div>
      {warning ? (
        <div className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          {warning}
        </div>
      ) : null}
      {items.length > 0 ? (
        <div className="space-y-1.5">
          {items.map((item) => (
            <GitHubActivitySectionRow
              key={item.id}
              item={item}
              {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
              {...(onItemContextMenu ? { onItemContextMenu } : {})}
              {...(getItemDragCapabilities ? { getItemDragCapabilities } : {})}
            />
          ))}
        </div>
      ) : loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-4/5" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded border border-dashed border-border/70 bg-background/60 px-3 py-5 text-center">
          <MarkGithubIcon className="size-4 text-muted-foreground/70" />
          <p className="text-xs text-muted-foreground">No GitHub activity matched yet.</p>
          <p className="text-[11px] text-muted-foreground/70">
            Pull requests, reviews, and issues from your linked repositories show up here.
          </p>
        </div>
      ) : null}
      {suggestedRepositoryCount && suggestedRepositoryCount > 0 ? (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <ExternalLink className="size-3" />
          {suggestedRepositoryCount} suggested repositories available
        </div>
      ) : null}
    </T3SurfacePanel>
  );
}
