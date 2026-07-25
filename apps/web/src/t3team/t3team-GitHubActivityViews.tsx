import { LinkExternalIcon } from "@primer/octicons-react";
import { useState } from "react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { useT3TeamAgentContextDrag } from "~/t3team/t3team-agentContextDrag";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import { GitHubActivityTooltipContent } from "~/t3team/t3team-GitHubActivityTooltipContent";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import {
  getGitHubActivityVisual,
  isActiveReviewRequested,
  isRedundantPullRequestReason,
  renderRelativeUpdatedAt,
} from "~/t3team/t3team-githubActivityViewUtils";

function formatReason(reason: string): string {
  return reason.replaceAll("_", " ");
}

function GitHubActivityInlineRow({
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
  const dragProps = useT3TeamAgentContextDrag({
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
      <visual.Icon className={`mt-0.5 size-3 shrink-0 ${visual.iconClassName}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-foreground/90">{item.subjectTitle ?? item.repository}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/80">
          {summaryLabel ? <span>{summaryLabel}</span> : null}
          {updatedAt ? <span>{updatedAt}</span> : null}
        </div>
      </div>
      {linkTarget ? (
        <LinkExternalIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground/70" />
      ) : null}
    </>
  );

  return (
    <div className="text-[11px]">
      <Tooltip>
        <TooltipTrigger
          render={
            linkTarget ? (
              <a
                href={linkTarget}
                target="_blank"
                rel="noreferrer"
                draggable={dragProps.draggable}
                className="relative z-10 flex cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-accent/35"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => onItemContextMenu?.(event, item)}
                onDragStart={dragProps.onDragStart}
                onDragEnd={dragProps.onDragEnd}
              />
            ) : (
              <div
                draggable={dragProps.draggable}
                className="flex items-start gap-1.5 rounded px-1 py-0.5"
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

export function GitHubActivityInlineList({
  items,
  limit = 3,
  compact,
  lastCheckedAt,
  onItemContextMenu,
  getItemDragCapabilities,
}: {
  items: ReadonlyArray<GitHubWorkActivityItem>;
  limit?: number;
  compact?: boolean;
  lastCheckedAt?: number;
  onItemContextMenu?: (event: React.MouseEvent, item: GitHubWorkActivityItem) => void;
  getItemDragCapabilities?: (item: GitHubWorkActivityItem) => AgentContextCapabilities;
}) {
  if (items.length === 0) return null;
  const [expanded, setExpanded] = useState(false);
  const visibleItems = items.slice(0, expanded ? items.length : limit);
  const remainingCount = Math.max(0, items.length - visibleItems.length);
  return (
    <div
      className={
        compact
          ? "mt-0.5 ml-0.5 rounded bg-muted/20 px-1 py-0.5"
          : "mt-2 ml-2 rounded border border-border/70 bg-muted/20 px-2 py-1.5"
      }
    >
      <div className={compact ? "space-y-1" : "space-y-1 border-l border-border/70 pl-2"}>
        {visibleItems.map((item) => (
          <GitHubActivityInlineRow
            key={item.id}
            item={item}
            {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
            {...(onItemContextMenu ? { onItemContextMenu } : {})}
            {...(getItemDragCapabilities ? { getItemDragCapabilities } : {})}
          />
        ))}
        {remainingCount > 0 ? (
          <button
            type="button"
            className="cursor-pointer text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(true);
            }}
          >
            +{remainingCount} more GitHub items
          </button>
        ) : expanded && items.length > limit ? (
          <button
            type="button"
            className="cursor-pointer text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(false);
            }}
          >
            Show fewer GitHub items
          </button>
        ) : null}
      </div>
    </div>
  );
}
